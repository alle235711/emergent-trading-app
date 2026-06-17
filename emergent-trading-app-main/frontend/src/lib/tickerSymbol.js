/**
 * tickerSymbol.js — map UI catalog symbols → Yahoo Finance tickers.
 * Mirrors backend/services/market_data.py YAHOO_ALIASES.
 */

export const YAHOO_ALIASES = {
    SWDA: "SWDA.MI",
    BTC: "BTC-USD",
    ETH: "ETH-USD",
    EURUSD: "EURUSD=X",
    GLD: "GLD",
    SPY: "SPY",
    AAPL: "AAPL",
    NVDA: "NVDA",
    TLT: "TLT",
};

/** Resolve a display symbol to its Yahoo Finance ticker. */
export const toYahooSymbol = (symbol) => {
    const s = (symbol || "").trim().toUpperCase();
    return YAHOO_ALIASES[s] || s;
};

/** Map global horizon → Yahoo history period. */
export const horizonToPeriod = (horizon) => {
    switch (horizon) {
        case "short":
            return "6mo";
        case "long":
            return "5y";
        default:
            return "2y";
    }
};
