"""
services/market_data.py
================================================================================
Hybrid Market-Data Router (asynchronous).

Architecture — "Setup Ibrido":
    • HISTORICAL  → deep OHLCV pulled from Yahoo Finance (yfinance) to calibrate
                    SDE / PDE / correlation matrices and to seed the live charts.
    • LIVE        → shared IBKR connection (ib_insync) for paper trading ticks.
                    If IBKR is unreachable or times out, silent fallback to Yahoo
                    Finance — the WebSocket /ws/market-stream/{ticker} never crashes.

The MarketDataRouter unifies both feeds and exposes:
    • get_history(ticker, period, interval) → JSON-serialisable OHLCV snapshot
    • subscribe(ticker) / unsubscribe(...)  → pub/sub of live ticks (one shared
                                              background stream per symbol)
    • last_price(ticker)                    → latest mark (used by the PaperBroker
                                              to fill orders and mark P&L)
    • get_quote(ticker)                     → on-demand last price (IBKR first,
                                              then Yahoo fallback)

Everything is async and thread-safe enough for FastAPI's single-loop model.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import random
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf
from ib_insync import IB, Contract, Forex, Stock  # type: ignore

logger = logging.getLogger("quant.market_data")

# ---------------------------------------------------------------------------
# Symbol resolution
# ---------------------------------------------------------------------------
YAHOO_ALIASES: Dict[str, str] = {
    "SWDA": "SWDA.MI",
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",
    "EURUSD": "EURUSD=X",
    "GLD": "GLD",
    "SPY": "SPY",
    "AAPL": "AAPL",
    "NVDA": "NVDA",
    "TLT": "TLT",
}

_FALLBACK_PRICES: Dict[str, float] = {
    "SWDA": 123.34,
    "BTC": 94100.0,
    "ETH": 3420.0,
    "EURUSD": 1.082,
    "GLD": 2384.5,
    "SPY": 548.7,
    "AAPL": 211.3,
    "NVDA": 121.4,
    "TLT": 94.8,
}

_FALLBACK_VOL: Dict[str, float] = {
    "SWDA": 0.14,
    "BTC": 0.62,
    "ETH": 0.71,
    "EURUSD": 0.08,
    "GLD": 0.13,
    "SPY": 0.16,
    "AAPL": 0.27,
    "NVDA": 0.45,
    "TLT": 0.15,
}

TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600

IBKR_HOST = os.environ.get("IBKR_HOST", "127.0.0.1")
IBKR_PORT = int(os.environ.get("IBKR_PORT", "7497"))  # 7497 = TWS paper
IBKR_CLIENT_ID = int(os.environ.get("IBKR_CLIENT_ID", "1"))
IBKR_ENABLED = os.environ.get("IBKR_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
IBKR_CONNECT_TIMEOUT = float(os.environ.get("IBKR_CONNECT_TIMEOUT", "4"))
IBKR_MARKET_DATA_TYPE = int(os.environ.get("IBKR_MARKET_DATA_TYPE", "1"))
IBKR_TICK_WAIT = float(os.environ.get("IBKR_TICK_WAIT", "1.5"))

IBKR_CONTRACTS: Dict[str, dict] = {
    "SWDA": {"kind": "stock", "symbol": "SWDA", "exchange": "SMART", "currency": "EUR", "primaryExchange": "BVME"},
    "AAPL": {"kind": "stock", "symbol": "AAPL", "exchange": "SMART", "currency": "USD"},
    "NVDA": {"kind": "stock", "symbol": "NVDA", "exchange": "SMART", "currency": "USD"},
    "SPY": {"kind": "stock", "symbol": "SPY", "exchange": "SMART", "currency": "USD"},
    "GLD": {"kind": "stock", "symbol": "GLD", "exchange": "SMART", "currency": "USD"},
    "TLT": {"kind": "stock", "symbol": "TLT", "exchange": "SMART", "currency": "USD"},
    "EURUSD": {"kind": "forex", "pair": "EURUSD"},
    "BTC": {"kind": "unsupported"},
    "ETH": {"kind": "unsupported"},
}


def normalize(ticker: str) -> str:
    return (ticker or "").strip().upper()


def resolve_symbol(ticker: str) -> str:
    t = normalize(ticker)
    return YAHOO_ALIASES.get(t, t)


def _finite(x) -> Optional[float]:
    try:
        v = float(x)
        return v if math.isfinite(v) and v > 0 else None
    except Exception:
        return None


def _price_from_ib_ticker(t) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """Extract last/bid/ask from an ib_insync Ticker object."""
    market_price = getattr(t, "marketPrice", None)
    market_price = market_price() if callable(market_price) else market_price
    price = (
        _finite(getattr(t, "last", None))
        or _finite(market_price)
        or _finite(getattr(t, "close", None))
        or _finite(getattr(t, "bid", None))
        or _finite(getattr(t, "ask", None))
    )
    bid = _finite(getattr(t, "bid", None))
    ask = _finite(getattr(t, "ask", None))
    return price, bid, ask


async def _to_thread(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))


def make_ib_contract(ticker: str) -> Contract:
    """Build an ib_insync Contract for a UI symbol."""
    sym = normalize(ticker)
    cfg = IBKR_CONTRACTS.get(sym, {"kind": "stock", "symbol": sym, "exchange": "SMART", "currency": "USD"})
    if cfg.get("kind") == "unsupported":
        raise ValueError(f"Nessun contratto IBKR configurato per {sym}")
    if cfg["kind"] == "forex":
        return Forex(cfg["pair"])
    contract = Stock(cfg["symbol"], cfg.get("exchange", "SMART"), cfg.get("currency", "USD"))
    primary = cfg.get("primaryExchange")
    if primary:
        contract.primaryExchange = primary
    return contract


# ---------------------------------------------------------------------------
# IBKRConnectionManager — single shared async connection for FastAPI
# ---------------------------------------------------------------------------
class IBKRConnectionManager:
    """
    Manages one shared ib_insync connection (localhost:7497, clientId=1).

    All live streams and on-demand quotes reuse this connection via
    ib.connectAsync, compatible with FastAPI's asyncio event loop.
    Connection failures are swallowed — callers fall back to Yahoo.
    """

    def __init__(self) -> None:
        self._ib: Optional[IB] = None
        self._lock = asyncio.Lock()
        self._md_type_set = False
        self._last_error: Optional[str] = None

    @property
    def is_connected(self) -> bool:
        return self._ib is not None and self._ib.isConnected()

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    async def connect(self) -> bool:
        """Connect to TWS/Gateway paper. Returns False silently on failure."""
        if not IBKR_ENABLED:
            return False

        async with self._lock:
            if self.is_connected:
                return True

            try:
                self._ib = IB()
                await asyncio.wait_for(
                    self._ib.connectAsync(
                        IBKR_HOST,
                        IBKR_PORT,
                        clientId=IBKR_CLIENT_ID,
                        timeout=IBKR_CONNECT_TIMEOUT,
                    ),
                    timeout=IBKR_CONNECT_TIMEOUT + 2.0,
                )
                if not self._md_type_set:
                    self._ib.reqMarketDataType(IBKR_MARKET_DATA_TYPE)
                    self._md_type_set = True
                self._last_error = None
                logger.info(
                    "[IBKR] connected host=%s port=%s clientId=%s mdType=%s",
                    IBKR_HOST, IBKR_PORT, IBKR_CLIENT_ID, IBKR_MARKET_DATA_TYPE,
                )
                return True
            except Exception as exc:
                self._last_error = str(exc)
                logger.info(
                    "[IBKR] unavailable (%s) — using Yahoo fallback",
                    exc,
                )
                await self._disconnect_unlocked()
                return False

    async def qualify_contract(self, contract: Contract) -> Optional[Contract]:
        if not await self.connect():
            return None
        try:
            qualified = await self._ib.qualifyContractsAsync(contract)
            return qualified[0] if qualified else contract
        except Exception as exc:
            logger.debug("[IBKR] qualify failed: %s", exc)
            return None

    async def subscribe_market_data(
        self, contract: Contract,
    ) -> Tuple[Optional[Contract], Optional[object]]:
        """
        Qualify contract and reqMktData on the shared connection.
        Returns (qualified_contract, ib_ticker) or (None, None) on failure.
        """
        if not await self.connect():
            return None, None

        try:
            qualified = await self.qualify_contract(contract)
            if qualified is None:
                return None, None
            ticker = self._ib.reqMktData(qualified, "", False, False)
            return qualified, ticker
        except Exception as exc:
            logger.debug("[IBKR] reqMktData failed: %s", exc)
            return None, None

    async def snapshot_price(
        self, ticker: str, wait: float = IBKR_TICK_WAIT,
    ) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        """
        One-shot IBKR price for get_quote. Cancels subscription after read.
        Returns (price, bid, ask) or (None, None, None).
        """
        try:
            contract = make_ib_contract(ticker)
        except ValueError:
            return None, None, None

        qualified, ib_ticker = await self.subscribe_market_data(contract)
        if ib_ticker is None or qualified is None:
            return None, None, None

        price = bid = ask = None
        deadline = asyncio.get_event_loop().time() + wait
        while asyncio.get_event_loop().time() < deadline:
            price, bid, ask = _price_from_ib_ticker(ib_ticker)
            if price is not None:
                break
            await asyncio.sleep(0.1)

        try:
            self._ib.cancelMktData(qualified)
        except Exception:
            pass

        return price, bid, ask

    async def cancel_market_data(self, contract: Optional[Contract]) -> None:
        if contract is None or not self.is_connected:
            return
        try:
            self._ib.cancelMktData(contract)
        except Exception:
            pass

    async def _disconnect_unlocked(self) -> None:
        if self._ib is not None:
            try:
                if self._ib.isConnected():
                    self._ib.disconnect()
            except Exception:
                pass
            self._ib = None

    async def shutdown(self) -> None:
        async with self._lock:
            await self._disconnect_unlocked()
            self._md_type_set = False


# Shared singleton — one IB connection for the whole app.
ibkr_manager = IBKRConnectionManager()


# ---------------------------------------------------------------------------
# IBKRPaperStream — live tick stream (IBKR primary, Yahoo fallback)
# ---------------------------------------------------------------------------
class IBKRPaperStream:
    """
    Per-symbol live tick stream for paper trading WebSocket fan-out.

    Primary:  shared IBKR reqMktData ticks
    Fallback: Yahoo Finance delayed quotes (never synthetic GBM unless seed fails)
    """

    def __init__(
        self,
        ticker: str,
        annual_vol: float = 0.25,
        tick_interval: float = 1.0,
    ) -> None:
        self.ticker = normalize(ticker)
        self.yahoo = resolve_symbol(ticker)
        self.annual_vol = annual_vol
        self.tick_interval = tick_interval

        self.connected = False
        self.ibkr_connected = False
        self.source = "yahoo-delayed"
        self.seed_price: Optional[float] = None
        self.session_open: Optional[float] = None
        self.last_price: Optional[float] = None
        self.last_bid: Optional[float] = None
        self.last_ask: Optional[float] = None
        self._ib_ticker = None
        self._ib_contract: Optional[Contract] = None
        self._ibkr_tick_seen = False
        self._tick_queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._update_handler = None

    async def connect(self) -> float:
        """Seed from Yahoo, then attempt IBKR live subscription."""
        seed = await self._fetch_yahoo_seed()
        self.seed_price = seed
        self.session_open = seed
        self.last_price = seed
        self.connected = True

        if IBKR_ENABLED:
            await self._connect_ibkr()

        logger.info(
            "[stream] %s → %s  seed=%.4f  σ=%.2f  source=%s",
            self.ticker, self.yahoo, seed, self.annual_vol, self.source,
        )
        return seed

    async def _connect_ibkr(self) -> None:
        try:
            contract = make_ib_contract(self.ticker)
        except ValueError:
            logger.debug("[stream] no IBKR contract for %s — Yahoo fallback", self.ticker)
            return

        qualified, ib_ticker = await ibkr_manager.subscribe_market_data(contract)
        if ib_ticker is None:
            self.ibkr_connected = False
            self.source = "yahoo-delayed"
            return

        self._ib_contract = qualified
        self._ib_ticker = ib_ticker
        self._update_handler = lambda t: self._on_ib_update(t)
        self._ib_ticker.updateEvent += self._update_handler
        self.ibkr_connected = True
        self.source = "IBKR"
        logger.info("[stream] IBKR live feed active for %s contract=%s", self.ticker, qualified)

    def _on_ib_update(self, t) -> None:
        price, bid, ask = _price_from_ib_ticker(t)
        size = _finite(getattr(t, "lastSize", None)) or _finite(getattr(t, "volume", None)) or 0
        if price is None:
            return

        self._ibkr_tick_seen = True
        self.last_price = price
        self.last_bid = bid
        self.last_ask = ask
        payload = self._build_tick(price, bid=bid, ask=ask, size=int(size), source="IBKR")
        try:
            self._tick_queue.put_nowait(payload)
        except asyncio.QueueFull:
            try:
                self._tick_queue.get_nowait()
            except Exception:
                pass
            try:
                self._tick_queue.put_nowait(payload)
            except Exception:
                pass

    async def _fetch_yahoo_seed(self) -> float:
        """Last price + realised vol from Yahoo (best-effort, never raises)."""
        fallback = _FALLBACK_PRICES.get(self.ticker, 100.0)
        try:
            def _pull():
                tk = yf.Ticker(self.yahoo)
                price = None
                try:
                    fast = getattr(tk, "fast_info", None)
                    if fast:
                        price = getattr(fast, "last_price", None) or fast.get("lastPrice")  # type: ignore
                except Exception:
                    price = None
                hist = tk.history(period="3mo", interval="1d", auto_adjust=True)
                if hist is not None and not hist.empty:
                    close = hist["Close"].dropna()
                    if price is None or not math.isfinite(price):
                        price = float(close.iloc[-1])
                    rets = np.log(close / close.shift(1)).dropna()
                    if len(rets) > 5:
                        self.annual_vol = float(
                            np.clip(rets.std(ddof=1) * math.sqrt(252), 0.03, 2.5)
                        )
                return price

            price = await _to_thread(_pull)
            if price and math.isfinite(price) and price > 0:
                return float(price)
        except Exception as exc:
            logger.debug("[stream] Yahoo seed failed for %s: %s", self.yahoo, exc)

        self.annual_vol = _FALLBACK_VOL.get(self.ticker, 0.25)
        return float(fallback)

    def _build_tick(
        self,
        price: float,
        bid: Optional[float] = None,
        ask: Optional[float] = None,
        size: int = 0,
        source: Optional[str] = None,
    ) -> dict:
        half_spread = max(price * self.annual_vol * 1e-3, price * 1e-5)
        bid = bid if bid is not None else price - half_spread
        ask = ask if ask is not None else price + half_spread
        open_px = self.session_open or price
        change = price - open_px
        change_pct = (change / open_px * 100.0) if open_px else 0.0

        return {
            "type": "tick",
            "ticker": self.ticker,
            "yahoo": self.yahoo,
            "price": round(price, 6),
            "bid": round(bid, 6),
            "ask": round(ask, 6),
            "spread": round(ask - bid, 6),
            "size": size,
            "session_open": round(open_px, 6),
            "change": round(change, 6),
            "change_pct": round(change_pct, 4),
            "ts": datetime.now(timezone.utc).isoformat(),
            "source": source or self.source,
            "ibkr_connected": self.ibkr_connected,
        }

    async def _yahoo_snapshot_tick(self) -> dict:
        """Fresh Yahoo mark — silent fallback path."""
        price = await self._fetch_yahoo_seed()
        if not math.isfinite(price) or price <= 0:
            price = self.last_price or self.seed_price or 100.0
        self.last_price = price
        return self._build_tick(price, source="yahoo-delayed")

    async def next_tick(self) -> dict:
        """
        Next tick: IBKR queue if connected, else Yahoo.
        Never raises — always returns a valid payload for the WebSocket.
        """
        if self.ibkr_connected:
            try:
                return await asyncio.wait_for(
                    self._tick_queue.get(),
                    timeout=max(2.0, self.tick_interval),
                )
            except asyncio.TimeoutError:
                if not ibkr_manager.is_connected:
                    self.ibkr_connected = False
                    self.source = "yahoo-delayed"
                    return await self._yahoo_snapshot_tick()
                price = self.last_price or self.seed_price or 100.0
                src = "IBKR(stale)" if self._ibkr_tick_seen else "IBKR(waiting)"
                return self._build_tick(price, bid=self.last_bid, ask=self.last_ask, source=src)

        await asyncio.sleep(self.tick_interval)
        return await self._yahoo_snapshot_tick()

    async def disconnect(self) -> None:
        self.connected = False
        if self._ib_ticker is not None and self._update_handler is not None:
            try:
                self._ib_ticker.updateEvent -= self._update_handler
            except Exception:
                pass
        await ibkr_manager.cancel_market_data(self._ib_contract)
        self._ib_ticker = None
        self._ib_contract = None
        self.ibkr_connected = False
        logger.debug("[stream] disconnected %s source=%s", self.ticker, self.source)


# ---------------------------------------------------------------------------
# Per-symbol hub — one background stream fanned out to many subscribers
# ---------------------------------------------------------------------------
class _TickerHub:
    """Owns a single IBKRPaperStream and broadcasts its ticks to N subscribers."""

    def __init__(self, ticker: str, on_tick) -> None:
        self.ticker = normalize(ticker)
        self.stream = IBKRPaperStream(ticker, annual_vol=_FALLBACK_VOL.get(self.ticker, 0.25))
        self._subscribers: set[asyncio.Queue] = set()
        self._task: Optional[asyncio.Task] = None
        self._on_tick = on_tick

    async def start(self) -> None:
        if self._task is None or self._task.done():
            try:
                await self.stream.connect()
            except Exception as exc:
                logger.info("[hub] connect failed for %s (%s) — Yahoo fallback", self.ticker, exc)
            self._task = asyncio.create_task(self._run(), name=f"hub-{self.ticker}")

    async def _run(self) -> None:
        """Tick loop — must never terminate the WebSocket consumer."""
        while True:
            try:
                tick = await self.stream.next_tick()
                self._on_tick(self.ticker, tick["price"])
                dead = []
                for q in list(self._subscribers):
                    try:
                        q.put_nowait(tick)
                    except asyncio.QueueFull:
                        dead.append(q)
                for q in dead:
                    self._subscribers.discard(q)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("[hub] tick error for %s: %s — continuing", self.ticker, exc)
                await asyncio.sleep(max(1.0, self.stream.tick_interval))

    def add_subscriber(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subscribers.add(q)
        return q

    def remove_subscriber(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    @property
    def idle(self) -> bool:
        return len(self._subscribers) == 0

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.stream.disconnect()


# ---------------------------------------------------------------------------
# MarketDataRouter — the public façade
# ---------------------------------------------------------------------------
class MarketDataRouter:
    """Unified async access to historical (Yahoo) + live (IBKR → Yahoo fallback) data."""

    def __init__(self) -> None:
        self._hubs: Dict[str, _TickerHub] = {}
        self._last_price: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def get_history(
        self,
        ticker: str,
        period: str = "6mo",
        interval: str = "1d",
    ) -> dict:
        """Deep OHLCV snapshot — always Yahoo (calibration layer)."""
        symbol = normalize(ticker)
        yahoo = resolve_symbol(ticker)

        def _pull():
            tk = yf.Ticker(yahoo)
            df = tk.history(period=period, interval=interval, auto_adjust=True)
            meta = {"currency": None, "name": symbol}
            try:
                info = getattr(tk, "info", None) or {}
                meta["name"] = info.get("longName") or info.get("shortName") or symbol
                meta["currency"] = info.get("currency")
            except Exception:
                pass
            return df, meta

        try:
            df, meta = await _to_thread(_pull)
        except Exception as exc:
            logger.debug("[router] history fetch failed for %s: %s", yahoo, exc)
            df, meta = pd.DataFrame(), {"currency": None, "name": symbol}

        candles: List[dict] = []
        if df is not None and not df.empty:
            df = df.dropna()
            df.index = pd.to_datetime(df.index)
            for idx, row in df.iterrows():
                candles.append(
                    {
                        "date": idx.strftime("%Y-%m-%d %H:%M") if interval.endswith(("m", "h")) else idx.strftime("%Y-%m-%d"),
                        "open": round(float(row.get("Open", row["Close"])), 6),
                        "high": round(float(row.get("High", row["Close"])), 6),
                        "low": round(float(row.get("Low", row["Close"])), 6),
                        "close": round(float(row["Close"]), 6),
                        "volume": int(row.get("Volume", 0) or 0),
                    }
                )
            self._last_price[symbol] = candles[-1]["close"]

        return {
            "ticker": symbol,
            "yahoo": yahoo,
            "period": period,
            "interval": interval,
            "name": meta.get("name"),
            "currency": meta.get("currency"),
            "candles": candles,
            "count": len(candles),
        }

    async def subscribe(self, ticker: str) -> Tuple[_TickerHub, asyncio.Queue]:
        symbol = normalize(ticker)
        async with self._lock:
            hub = self._hubs.get(symbol)
            if hub is None:
                hub = _TickerHub(symbol, on_tick=self._cache_price)
                self._hubs[symbol] = hub
            await hub.start()
            q = hub.add_subscriber()
            if hub.stream.last_price is not None:
                self._cache_price(symbol, hub.stream.last_price)
        return hub, q

    async def unsubscribe(self, ticker: str, q: asyncio.Queue) -> None:
        symbol = normalize(ticker)
        async with self._lock:
            hub = self._hubs.get(symbol)
            if not hub:
                return
            hub.remove_subscriber(q)
            if hub.idle:
                await hub.stop()
                self._hubs.pop(symbol, None)

    def _cache_price(self, ticker: str, price: float) -> None:
        self._last_price[normalize(ticker)] = float(price)

    def last_price(self, ticker: str) -> Optional[float]:
        return self._last_price.get(normalize(ticker))

    async def get_quote(self, ticker: str) -> dict:
        """
        Latest mark: IBKR live (shared connection) → active stream cache → Yahoo.
        Never raises.
        """
        symbol = normalize(ticker)

        hub = self._hubs.get(symbol)
        if hub and hub.stream.ibkr_connected:
            cached = self._last_price.get(symbol)
            if cached is not None:
                return {
                    "ticker": symbol,
                    "price": cached,
                    "source": "IBKR",
                    "ibkr_connected": True,
                    "delayed": False,
                }

        if IBKR_ENABLED:
            try:
                price, bid, ask = await ibkr_manager.snapshot_price(symbol)
                if price is not None:
                    self._cache_price(symbol, price)
                    return {
                        "ticker": symbol,
                        "price": price,
                        "bid": bid,
                        "ask": ask,
                        "source": "IBKR",
                        "ibkr_connected": ibkr_manager.is_connected,
                        "delayed": False,
                    }
            except Exception as exc:
                logger.debug("[router] IBKR quote failed for %s: %s", symbol, exc)

        return await self._yahoo_quote(symbol)

    async def _yahoo_quote(self, symbol: str) -> dict:
        yahoo = resolve_symbol(symbol)

        def _pull():
            tk = yf.Ticker(yahoo)
            try:
                fast = getattr(tk, "fast_info", None)
                if fast:
                    px = getattr(fast, "last_price", None) or fast.get("lastPrice")  # type: ignore
                    if px and math.isfinite(px):
                        return float(px)
            except Exception:
                pass
            hist = tk.history(period="5d", interval="1d", auto_adjust=True)
            if hist is not None and not hist.empty:
                return float(hist["Close"].dropna().iloc[-1])
            return None

        try:
            px = await _to_thread(_pull)
        except Exception as exc:
            logger.debug("[router] Yahoo quote failed for %s: %s", yahoo, exc)
            px = None

        if px is None or not math.isfinite(px) or px <= 0:
            px = _FALLBACK_PRICES.get(symbol, 100.0)

        self._cache_price(symbol, px)
        return {
            "ticker": symbol,
            "price": px,
            "source": "yahoo-delayed",
            "ibkr_connected": False,
            "delayed": True,
            "delay_note": "Yahoo Finance delayed prices (15–20 min). IBKR unavailable.",
        }

    async def shutdown(self) -> None:
        async with self._lock:
            for hub in list(self._hubs.values()):
                await hub.stop()
            self._hubs.clear()
        await ibkr_manager.shutdown()


market_router = MarketDataRouter()
