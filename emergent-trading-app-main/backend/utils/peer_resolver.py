"""
peer_resolver.py — shared peer-basket resolution for quant geometry models.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import yfinance as yf

from services.market_data import YAHOO_ALIASES, resolve_symbol

PEER_YAHOO_ALIASES: Dict[str, str] = {
    **YAHOO_ALIASES,
    "SOL": "SOL-USD",
    "BNB": "BNB-USD",
    "XRP": "XRP-USD",
    "ADA": "ADA-USD",
    "AVAX": "AVAX-USD",
    "DOT": "DOT-USD",
    "LINK": "LINK-USD",
    "MATIC": "MATIC-USD",
    "LTC": "LTC-USD",
    "DOGE": "DOGE-USD",
    "ATOM": "ATOM-USD",
    "ARB": "ARB-USD",
    "OP": "OP-USD",
    "UNI": "UNI-USD",
    "AAVE": "AAVE-USD",
    "LDO": "LDO-USD",
    "MKR": "MKR-USD",
    "ENS": "ENS-USD",
    "EUNL": "EUNL.DE",
    "VWCE": "VWCE.DE",
    "EXSA": "EXSA.DE",
    "IWDA": "IWDA.AS",
    "EMU": "EMU.PA",
    "EMIM": "EMIM.L",
    "AGGH": "AGGH.L",
    "XDWD": "XDWD.DE",
    "MEUD": "MEUD.PA",
    "WLD": "WLD.PA",
    "QQQ": "QQQ",
    "DIA": "DIA",
    "IWM": "IWM",
    "XLK": "XLK",
    "XLF": "XLF",
    "XLE": "XLE",
    "XLV": "XLV",
    "XLY": "XLY",
    "XLP": "XLP",
    "XLI": "XLI",
    "VOO": "VOO",
    "VTI": "VTI",
    "IVV": "IVV",
    "IJH": "IJH",
    "IWB": "IWB",
    "SCHB": "SCHB",
    "VV": "VV",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "AMZN": "AMZN",
    "META": "META",
    "TSM": "TSM",
    "AVGO": "AVGO",
    "QCOM": "QCOM",
    "MU": "MU",
    "SOXX": "SOXX",
    "AMD": "AMD",
    "ASML": "ASML",
    "INTC": "INTC",
    "ARM": "ARM",
    "SMCI": "SMCI",
    "MRVL": "MRVL",
    "SLV": "SLV",
    "GDX": "GDX",
    "PPLT": "PPLT",
    "DBC": "DBC",
    "USO": "USO",
    "UNG": "UNG",
    "COPX": "COPX",
    "WEAT": "WEAT",
    "CORN": "CORN",
    "IAU": "IAU",
    "PDBC": "PDBC",
    "DJP": "DJP",
    "GSG": "GSG",
    "COMT": "COMT",
    "COMB": "COMB",
    "BCI": "BCI",
    "FTGC": "FTGC",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "USDCHF": "USDCHF=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "USDCAD=X",
    "NZDUSD": "NZDUSD=X",
    "DXY": "DX-Y.NYB",
    "EURGBP": "EURGBP=X",
    "EURJPY": "EURJPY=X",
    "IEF": "IEF",
    "SHY": "SHY",
    "AGG": "AGG",
    "LQD": "LQD",
    "HYG": "HYG",
    "TIP": "TIP",
    "BND": "BND",
    "MUB": "MUB",
    "EMB": "EMB",
    "VCIT": "VCIT",
    "VCSH": "VCSH",
    "IBIT": "IBIT",
    "FBTC": "FBTC",
    "GBTC": "GBTC",
    "BITB": "BITB",
    "ARKB": "ARKB",
    "HODL": "HODL",
    "EZBC": "EZBC",
    "BTCO": "BTCO",
    "BRRR": "BRRR",
    "DEFI": "DEFI",
    "XBI": "XBI",
    "IBB": "IBB",
    "XPH": "XPH",
    "SMH": "SMH",
    "IGV": "IGV",
    "KBE": "KBE",
    "KRE": "KRE",
    "XOP": "XOP",
    "OIH": "OIH",
    "XRT": "XRT",
    "XHB": "XHB",
    "ITA": "ITA",
    "XME": "XME",
    "XLC": "XLC",
    "XLRE": "XLRE",
    "XLU": "XLU",
    "XLB": "XLB",
}

TICKER_PEERS: Dict[str, List[str]] = {
    "SWDA": ["SWDA", "EUNL", "VWCE", "SPY", "EXSA", "IWDA", "EMU", "EMIM", "AGGH", "XDWD", "MEUD", "WLD"],
    "AAPL": ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSM", "AVGO", "QCOM", "MU", "SOXX"],
    "BTC": ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOT", "LINK", "MATIC", "LTC", "DOGE", "ATOM"],
    "ETH": ["ETH", "BTC", "SOL", "ARB", "OP", "MATIC", "LINK", "UNI", "AAVE", "LDO", "MKR", "ENS"],
    "SPY": ["SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "VOO"],
    "NVDA": ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "QCOM", "INTC", "ARM", "SMCI", "MRVL"],
    "GLD": ["GLD", "SLV", "GDX", "PPLT", "DBC", "USO", "UNG", "COPX", "WEAT", "CORN"],
    "EURUSD": ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "DXY", "EURGBP", "EURJPY"],
    "TLT": ["TLT", "IEF", "SHY", "AGG", "LQD", "HYG", "TIP", "BND", "MUB", "EMB"],
}

# Yahoo sector → primary sector ETF.
SECTOR_ETF_MAP: Dict[str, str] = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Healthcare": "XLV",
    "Energy": "XLE",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Industrials": "XLI",
    "Basic Materials": "XLB",
    "Communication Services": "XLC",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
}

# Yahoo industry → niche sector ETF (when available).
INDUSTRY_ETF_MAP: Dict[str, str] = {
    "Biotechnology": "XBI",
    "Drug Manufacturers—General": "XPH",
    "Drug Manufacturers - General": "XPH",
    "Drug Manufacturers—Specialty & Generic": "XPH",
    "Semiconductors": "SMH",
    "Software—Infrastructure": "IGV",
    "Software - Infrastructure": "IGV",
    "Software—Application": "IGV",
    "Banks—Regional": "KRE",
    "Banks - Regional": "KRE",
    "Banks—Diversified": "KBE",
    "Oil & Gas E&P": "XOP",
    "Oil & Gas Integrated": "XLE",
    "Aerospace & Defense": "ITA",
    "Specialty Retail": "XRT",
    "Residential Construction": "XHB",
    "Gold": "GDX",
    "Copper": "COPX",
}

# Tight sector satellites — no macro cross-asset dump.
SECTOR_ETF_EXPANSION: Dict[str, List[str]] = {
    "XLK": ["SOXX", "SMH", "IGV"],
    "XLF": ["KBE", "KRE"],
    "XLV": ["XBI", "IBB", "XPH"],
    "XLE": ["XOP", "OIH"],
    "XLY": ["XRT", "XHB"],
    "XLP": ["XLP"],
    "XLI": ["ITA", "XLI"],
    "XLB": ["XME", "XLB"],
    "XLC": ["XLC"],
    "XLRE": ["XLRE"],
    "XLU": ["XLU"],
    "GLD": ["SLV", "GDX", "IAU"],
    "TLT": ["IEF", "AGG", "LQD"],
}

COMMODITY_BASKET = ["GLD", "SLV", "IAU", "PDBC", "DJP", "GSG", "COMT", "COMB", "BCI", "FTGC"]
BOND_BASKET = ["TLT", "IEF", "SHY", "AGG", "BND", "LQD", "HYG", "EMB", "VCIT", "VCSH"]
CRYPTO_ETF_BASKET = ["IBIT", "FBTC", "GBTC", "BITB", "ARKB", "HODL", "EZBC", "BTCO", "BRRR", "DEFI"]

_SMALL_CAP_THRESHOLD = 2_000_000_000


def resolve_yahoo(symbol: str) -> str:
    s = (symbol or "").strip().upper()
    return PEER_YAHOO_ALIASES.get(s, resolve_symbol(s))


def _dedupe_peers(anchor: str, candidates: List[str]) -> List[str]:
    seen: set = set()
    out: List[str] = []
    anchor_u = anchor.strip().upper()
    if anchor_u and anchor_u not in seen:
        seen.add(anchor_u)
        out.append(anchor_u)
    for p in candidates:
        pu = (p or "").strip().upper()
        if not pu or pu in seen:
            continue
        seen.add(pu)
        out.append(pu)
    return out


def _broad_market_etf(ticker: str) -> str:
    """Single broad-market proxy from market cap when sector/recs are unavailable."""
    try:
        info = yf.Ticker(resolve_yahoo(ticker)).info or {}
        cap = info.get("marketCap") or 0
        if cap and cap < _SMALL_CAP_THRESHOLD:
            return "IWM"
    except Exception:
        pass
    return "SPY"


def _asset_class_peers(sym: str) -> List[str]:
    """Tight baskets only for macro/commodity/crypto/bond instruments."""
    if sym in {"GLD", "SLV", "IAU", "USO", "UNG", "DBC", "GDX"}:
        return COMMODITY_BASKET
    if sym in {"TLT", "IEF", "SHY", "AGG", "BND", "LQD", "HYG", "TIP"}:
        return BOND_BASKET
    if sym in {"BTC", "ETH"} or sym.endswith("-USD"):
        return CRYPTO_ETF_BASKET
    if sym in {"IBIT", "FBTC", "GBTC", "BITB", "ARKB", "HODL", "EZBC", "BTCO", "BRRR", "DEFI"}:
        return CRYPTO_ETF_BASKET
    return []


def _sector_expansion(etf: str) -> List[str]:
    return list(SECTOR_ETF_EXPANSION.get(etf, []))


def _yahoo_peer_hints(ticker: str, limit: int = 10) -> Tuple[List[str], bool, bool]:
    """
    Yahoo-driven peer hints: recommendedSymbols, sector ETF, industry ETF.

    Returns (symbols, has_recommended, has_sector_etf).
    """
    out: List[str] = []
    has_recommended = False
    has_sector = False
    try:
        info = yf.Ticker(resolve_yahoo(ticker)).info or {}
        for rec in (info.get("recommendedSymbols") or [])[:limit]:
            s = (rec.get("symbol") or "").strip().upper()
            if s:
                out.append(s)
                has_recommended = True

        sector = info.get("sector") or ""
        industry = info.get("industry") or ""
        sector_etf = SECTOR_ETF_MAP.get(sector, "")
        if sector_etf:
            out.append(sector_etf)
            out.extend(_sector_expansion(sector_etf))
            has_sector = True

        industry_etf = INDUSTRY_ETF_MAP.get(industry, "")
        if industry_etf and industry_etf not in out:
            out.append(industry_etf)
            out.extend(_sector_expansion(industry_etf))
    except Exception:
        pass
    return out, has_recommended, has_sector


def _etf_holdings(ticker: str, limit: int = 15) -> List[str]:
    out: List[str] = []
    try:
        tk = yf.Ticker(resolve_yahoo(ticker))
        info = tk.info or {}
        for key in ("holdings", "topHoldings"):
            holdings = info.get(key)
            if isinstance(holdings, list):
                for h in holdings[:limit]:
                    if isinstance(h, dict):
                        s = (h.get("symbol") or h.get("holdingSymbol") or "").strip().upper()
                    else:
                        s = str(h).strip().upper()
                    if s:
                        out.append(s)
        funds = getattr(tk, "funds_data", None)
        if funds is not None:
            top = getattr(funds, "top_holdings", None)
            if top is not None and hasattr(top, "index"):
                for s in list(top.index)[:limit]:
                    su = str(s).strip().upper()
                    if su:
                        out.append(su)
    except Exception:
        pass
    return out


def _dynamic_peer_candidates(sym: str, *, yahoo_limit: int = 10) -> List[str]:
    """Sector/recs/asset-class driven basket — no universal macro proxy dump."""
    asset_peers = _asset_class_peers(sym)
    if asset_peers:
        return [sym, *asset_peers]

    candidates = [sym]
    hints, has_recommended, has_sector = _yahoo_peer_hints(sym, limit=yahoo_limit)
    candidates.extend(hints)

    if not has_recommended and not has_sector:
        candidates.append(_broad_market_etf(sym))

    return candidates


def resolve_peers(ticker: str, n_peers: int = 10) -> List[str]:
    """
    Resolve a peer basket for *ticker*.

    1. TICKER_PEERS fast path
    2. Yahoo recommendedSymbols + sector/industry ETFs (+ tight sector expansion)
    3. Single broad-market ETF (SPY/IWM) only when sector & recs are absent
    4. Deduplicate; anchor always first
    """
    sym = (ticker or "SPY").strip().upper()
    n_peers = max(3, int(n_peers))

    if sym in TICKER_PEERS:
        candidates = list(TICKER_PEERS[sym])
    else:
        candidates = _dynamic_peer_candidates(sym, yahoo_limit=10)

    peers = _dedupe_peers(sym, candidates)[:n_peers]
    if len(peers) < 3:
        raise ValueError(
            f"Insufficient peers for {sym}: found {len(peers)}, need at least 3. "
            "Try a more liquid ticker or widen the peer basket."
        )
    return peers


def resolve_large_universe(ticker: str, n_assets: int = 30) -> List[str]:
    """Expand cross-section for spectral models — sector/recs/holdings only."""
    sym = (ticker or "SPY").strip().upper()
    n_assets = max(3, int(n_assets))

    if sym in TICKER_PEERS:
        candidates = list(TICKER_PEERS[sym])
    else:
        candidates = [sym]
        candidates.extend(_etf_holdings(sym, limit=n_assets))
        hints, has_recommended, has_sector = _yahoo_peer_hints(sym, limit=16)
        candidates.extend(hints)
        candidates.extend(_asset_class_peers(sym))
        if not has_recommended and not has_sector and not _asset_class_peers(sym):
            candidates.append(_broad_market_etf(sym))

    peers = _dedupe_peers(sym, candidates)[:n_assets]
    if len(peers) < 3:
        raise ValueError(
            f"Insufficient universe for {sym}: found {len(peers)}, need at least 3."
        )
    return peers
