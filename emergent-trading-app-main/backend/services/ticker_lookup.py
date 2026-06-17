"""
ticker_lookup.py — Yahoo Finance ticker validation and search.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import yfinance as yf

from utils.peer_resolver import resolve_yahoo

_EXCLUDE_QUOTE_TYPES = {"MUTUALFUND", "FUTURE"}
_TYPE_LABELS = {
    "EQUITY": "Stock",
    "ETF": "ETF",
    "ETN": "ETN",
    "CRYPTOCURRENCY": "Crypto",
    "INDEX": "Index",
    "CURRENCY": "Forex",
}


def _quote_type_label(raw: Optional[str]) -> str:
    if not raw:
        return "Stock"
    key = str(raw).upper()
    return _TYPE_LABELS.get(key, key.title())


def _read_fast_info(ticker: yf.Ticker) -> Dict[str, Any]:
    try:
        fi = ticker.fast_info
        if fi is None:
            return {}
        if hasattr(fi, "items"):
            return dict(fi)
        return {
            k: getattr(fi, k)
            for k in dir(fi)
            if not k.startswith("_") and not callable(getattr(fi, k, None))
        }
    except Exception:
        return {}


def validate_ticker(ticker: str) -> Dict[str, Any]:
    sym = (ticker or "").strip().upper()
    if not sym:
        return {"valid": False, "error": "Ticker symbol is required"}

    yahoo = resolve_yahoo(sym)
    try:
        tk = yf.Ticker(yahoo)
        fi = _read_fast_info(tk)
        info = {}
        try:
            info = tk.info or {}
        except Exception:
            pass

        last_price = fi.get("lastPrice") or fi.get("last_price") or info.get("regularMarketPrice")
        name = (
            info.get("longName")
            or info.get("shortName")
            or fi.get("shortName")
            or sym
        )
        quote_type = info.get("quoteType") or fi.get("quoteType") or ""
        currency = info.get("currency") or fi.get("currency")
        exchange = (
            info.get("exchange")
            or info.get("fullExchangeName")
            or fi.get("exchange")
            or ""
        )

        if last_price is None and not info.get("symbol"):
            return {"valid": False, "error": "Not found on Yahoo Finance"}

        return {
            "valid": True,
            "symbol": info.get("symbol", yahoo).upper(),
            "name": name,
            "type": _quote_type_label(quote_type),
            "currency": currency,
            "exchange": exchange,
        }
    except Exception:
        return {"valid": False, "error": "Not found on Yahoo Finance"}


def search_tickers(query: str, limit: int = 8) -> List[Dict[str, str]]:
    q = (query or "").strip()
    if len(q) < 1:
        return []

    results: List[Dict[str, str]] = []
    seen: set = set()

    try:
        search = yf.Search(q, max_results=max(limit * 2, 12))
        quotes = getattr(search, "quotes", None) or []
    except Exception:
        quotes = []

    for item in quotes:
        if not isinstance(item, dict):
            continue
        qtype = str(item.get("quoteType") or item.get("type") or "").upper()
        if qtype in _EXCLUDE_QUOTE_TYPES:
            continue
        symbol = (item.get("symbol") or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        results.append({
            "symbol": symbol,
            "name": item.get("longname") or item.get("shortname") or symbol,
            "type": _quote_type_label(qtype or item.get("type")),
        })
        if len(results) >= limit:
            break

    return results
