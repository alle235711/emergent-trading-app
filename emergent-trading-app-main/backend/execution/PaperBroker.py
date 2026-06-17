"""
execution/PaperBroker.py
================================================================================
Simulated paper-trading engine.

In the "Setup Ibrido" the real execution happens manually on an external Italian
broker (Fineco / Directa); this engine mirrors those decisions in a simulated
portfolio so the user can rehearse and track P&L against the LIVE price coming
from the WebSocket feed (services/market_data.IBKRPaperStream).

Responsibilities:
    • Accept orders (buy / sell, market / limit / stop).
    • Maintain a persistent portfolio (cash + signed positions) in SQLite.
    • Compute realised P&L on fills (avg-cost accounting, supports flips/shorts).
    • Compute unrealised P&L + equity using an injected live-price map.

The store is a tiny SQLite database so the simulation survives restarts. All
mutations are guarded by a threading.Lock; SQLite is opened with
check_same_thread=False so FastAPI's threadpool can call in.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

INITIAL_CASH = 50_000.0
CURRENCY = "EUR"

_DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "paper_broker.db"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _apply_fill(qty: float, avg: float, delta: float, price: float):
    """
    Avg-cost position update for a signed fill.

    Args:
        qty   current signed position (>0 long, <0 short)
        avg   current average entry price
        delta signed fill quantity (+buy, −sell)
        price fill price
    Returns:
        (new_qty, new_avg, realized_pnl)
    """
    new_qty = qty + delta
    realized = 0.0

    opening_or_increasing = qty == 0 or (qty > 0) == (delta > 0)
    if opening_or_increasing:
        denom = abs(qty) + abs(delta)
        new_avg = (abs(qty) * avg + abs(delta) * price) / denom if denom else 0.0
    else:
        # Reducing, closing, or flipping the position.
        closing = min(abs(delta), abs(qty))
        direction = 1.0 if qty > 0 else -1.0
        realized = (price - avg) * closing * direction
        if abs(delta) <= abs(qty):
            new_avg = avg  # partial/full close keeps the entry basis
        else:
            new_avg = price  # flipped through zero → new basis at fill

    if abs(new_qty) < 1e-12:
        new_qty = 0.0
        new_avg = 0.0
    return new_qty, new_avg, realized


class PaperBroker:
    """SQLite-backed simulated broker with live-price P&L."""

    def __init__(self, db_path: Optional[str] = None, initial_cash: float = INITIAL_CASH):
        self.db_path = str(db_path or os.environ.get("PAPER_BROKER_DB", _DEFAULT_DB))
        self.initial_cash = initial_cash
        self._lock = threading.Lock()
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()

    # ---- schema ----------------------------------------------------------
    def _init_db(self) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS account (
                    id           INTEGER PRIMARY KEY CHECK (id = 1),
                    cash         REAL NOT NULL,
                    initial_cash REAL NOT NULL,
                    currency     TEXT NOT NULL,
                    realized_pnl REAL NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS positions (
                    ticker     TEXT PRIMARY KEY,
                    qty        REAL NOT NULL,
                    avg_price  REAL NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS orders (
                    id           TEXT PRIMARY KEY,
                    ts           TEXT NOT NULL,
                    ticker       TEXT NOT NULL,
                    side         TEXT NOT NULL,
                    qty          REAL NOT NULL,
                    price        REAL NOT NULL,
                    order_type   TEXT NOT NULL,
                    status       TEXT NOT NULL,
                    realized_pnl REAL NOT NULL DEFAULT 0,
                    note         TEXT
                );
                """
            )
            cur.execute("SELECT COUNT(*) AS n FROM account")
            if cur.fetchone()["n"] == 0:
                cur.execute(
                    "INSERT INTO account (id, cash, initial_cash, currency, realized_pnl) "
                    "VALUES (1, ?, ?, ?, 0)",
                    (self.initial_cash, self.initial_cash, CURRENCY),
                )
            self._conn.commit()

    # ---- reads -----------------------------------------------------------
    def _account_row(self) -> sqlite3.Row:
        return self._conn.execute("SELECT * FROM account WHERE id = 1").fetchone()

    def list_positions(self) -> List[dict]:
        rows = self._conn.execute(
            "SELECT ticker, qty, avg_price, updated_at FROM positions WHERE ABS(qty) > 1e-9 "
            "ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def list_orders(self, limit: int = 50) -> List[dict]:
        rows = self._conn.execute(
            "SELECT * FROM orders ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    # ---- order execution -------------------------------------------------
    def execute(
        self,
        ticker: str,
        side: str,
        quantity: float,
        fill_price: float,
        order_type: str = "market",
        reference_price: Optional[float] = None,
    ) -> dict:
        """
        Fill an order against `fill_price` and mutate the simulated portfolio.

        Returns {ok, message, order?} — `order` is the persisted order record.
        """
        ticker = (ticker or "").strip().upper()
        side = (side or "").lower()
        qty = float(quantity)

        if not ticker:
            return {"ok": False, "message": "Ticker mancante"}
        if side not in ("buy", "sell"):
            return {"ok": False, "message": "Side non valido (buy/sell)"}
        if not (qty > 0) or qty != qty:  # qty>0 and not NaN
            return {"ok": False, "message": "Quantità deve essere > 0"}
        if not (fill_price > 0) or fill_price != fill_price:
            return {"ok": False, "message": "Prezzo live non disponibile"}

        delta = qty if side == "buy" else -qty
        cost = delta * fill_price  # cash flows OUT on buy (+delta → −cash)

        with self._lock:
            acct = self._account_row()
            cash = float(acct["cash"])

            # Cash guard only applies to net cash outflow (buys / increasing long).
            if cost > 0 and cost > cash + 1e-6:
                return {
                    "ok": False,
                    "message": f"Liquidità simulata insufficiente (serve {cost:,.2f}, disponibile {cash:,.2f})",
                }

            pos = self._conn.execute(
                "SELECT qty, avg_price FROM positions WHERE ticker = ?", (ticker,)
            ).fetchone()
            cur_qty = float(pos["qty"]) if pos else 0.0
            cur_avg = float(pos["avg_price"]) if pos else 0.0

            new_qty, new_avg, realized = _apply_fill(cur_qty, cur_avg, delta, fill_price)

            new_cash = cash - cost
            self._conn.execute(
                "UPDATE account SET cash = ?, realized_pnl = realized_pnl + ? WHERE id = 1",
                (new_cash, realized),
            )

            if abs(new_qty) < 1e-9:
                self._conn.execute("DELETE FROM positions WHERE ticker = ?", (ticker,))
            else:
                self._conn.execute(
                    "INSERT INTO positions (ticker, qty, avg_price, updated_at) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(ticker) DO UPDATE SET qty = excluded.qty, "
                    "avg_price = excluded.avg_price, updated_at = excluded.updated_at",
                    (ticker, new_qty, new_avg, _now()),
                )

            order_id = f"o_{uuid.uuid4().hex[:12]}"
            order = {
                "id": order_id,
                "ts": _now(),
                "ticker": ticker,
                "side": side,
                "qty": qty,
                "price": round(fill_price, 6),
                "order_type": order_type,
                "status": "filled",
                "realized_pnl": round(realized, 6),
                "note": None if reference_price is None else f"ref={reference_price:.4f}",
            }
            self._conn.execute(
                "INSERT INTO orders (id, ts, ticker, side, qty, price, order_type, status, realized_pnl, note) "
                "VALUES (:id, :ts, :ticker, :side, :qty, :price, :order_type, :status, :realized_pnl, :note)",
                order,
            )
            self._conn.commit()

        return {
            "ok": True,
            "message": f"PAPER {side.upper()} {ticker} × {qty:g} @ {fill_price:.4f}",
            "order": order,
        }

    # ---- portfolio / P&L -------------------------------------------------
    def portfolio(self, price_map: Optional[Dict[str, float]] = None) -> dict:
        """
        Full portfolio snapshot. `price_map` supplies the LIVE mark per ticker;
        any missing symbol falls back to its average entry price.
        """
        price_map = {k.upper(): float(v) for k, v in (price_map or {}).items()}
        acct = self._account_row()
        cash = float(acct["cash"])
        realized = float(acct["realized_pnl"])

        positions = []
        market_value = 0.0
        unrealized_total = 0.0
        for p in self.list_positions():
            tk = p["ticker"]
            qty = float(p["qty"])
            avg = float(p["avg_price"])
            last = price_map.get(tk, avg)
            value = qty * last
            unreal = (last - avg) * qty
            cost_basis = abs(qty) * avg
            market_value += value
            unrealized_total += unreal
            positions.append(
                {
                    "ticker": tk,
                    "qty": round(qty, 8),
                    "side": "long" if qty > 0 else "short",
                    "avg_price": round(avg, 6),
                    "last_price": round(last, 6),
                    "market_value": round(value, 2),
                    "unrealized_pnl": round(unreal, 2),
                    "unrealized_pct": round((unreal / cost_basis * 100.0) if cost_basis else 0.0, 3),
                    "updated_at": p["updated_at"],
                }
            )

        equity = cash + market_value
        return {
            "currency": acct["currency"],
            "cash": round(cash, 2),
            "initial_cash": round(float(acct["initial_cash"]), 2),
            "market_value": round(market_value, 2),
            "equity": round(equity, 2),
            "realized_pnl": round(realized, 2),
            "unrealized_pnl": round(unrealized_total, 2),
            "total_pnl": round(equity - float(acct["initial_cash"]), 2),
            "total_return_pct": round(
                (equity / float(acct["initial_cash"]) - 1.0) * 100.0
                if acct["initial_cash"]
                else 0.0,
                3,
            ),
            "positions": positions,
            "n_positions": len(positions),
        }

    def held_tickers(self) -> List[str]:
        return [p["ticker"] for p in self.list_positions()]

    # ---- admin -----------------------------------------------------------
    def reset(self) -> dict:
        with self._lock:
            self._conn.execute("DELETE FROM positions")
            self._conn.execute("DELETE FROM orders")
            self._conn.execute(
                "UPDATE account SET cash = ?, initial_cash = ?, realized_pnl = 0 WHERE id = 1",
                (self.initial_cash, self.initial_cash),
            )
            self._conn.commit()
        return {"ok": True, "message": "Portafoglio simulato resettato"}


# Module-level singleton shared by the FastAPI app.
paper_broker = PaperBroker()
