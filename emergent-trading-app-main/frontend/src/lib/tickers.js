/**
 * tickers.js
 * ────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the GLOBAL instrument universe.
 *
 * Every entry carries both *display* metadata (name, asset class, accent) and a
 * compact *calibration profile* that re-parametrises the mock generators of the
 * geometric/algebraic research rooms (Models 9–13). Selecting a ticker from the
 * navbar therefore recalibrates every dashboard on the typical statistical
 * fingerprint of that instrument:
 *
 *   • price       reference spot (used as S₀ / scale anchor)
 *   • vol         annualised realised volatility (drives spectral spread,
 *                 obstruction magnitude, singularity density …)
 *   • nNodes      cardinality of the peer graph (clique complex / Hodge / RMT)
 *   • connectivity baseline edge density of the correlation network ∈ (0,1)
 *   • curvature   deformation parameter of the affine scheme (singularity bias)
 *   • peers       human-readable basket used to label graph vertices
 *
 * A symbol-derived hash provides a deterministic per-ticker RNG seed so every
 * render is stable (good for screenshots / visual regression).
 */

/** FNV-1a string hash → uint32, used to seed the deterministic RNG per ticker. */
export function hashSeed(str) {
    let h = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Asset-class → accent colour (kept in JS so charts can reuse it). */
export const ASSET_CLASS_ACCENT = {
    ETF: "#00E5C0",
    Stock: "#4F8BFF",
    Crypto: "#A78BFA",
    Index: "#FFB020",
    Forex: "#22D3EE",
    Commodity: "#F59E0B",
    Bond: "#94A3B8",
};

/** @type {Array<{symbol:string,name:string,assetClass:string,price:number,vol:number,nNodes:number,connectivity:number,curvature:number,peers:string[]}>} */
export const TICKER_CATALOG = [
    {
        symbol: "SWDA",
        name: "iShares Core MSCI World",
        assetClass: "ETF",
        price: 102.4,
        vol: 0.14,
        nNodes: 12,
        connectivity: 0.34,
        curvature: 0.18,
        peers: ["SWDA", "EUNL", "VWCE", "SPY", "EXSA", "IWDA", "EMU", "EMIM", "AGGH", "XDWD", "MEUD", "WLD"],
    },
    {
        symbol: "AAPL",
        name: "Apple Inc.",
        assetClass: "Stock",
        price: 211.3,
        vol: 0.27,
        nNodes: 11,
        connectivity: 0.42,
        curvature: 0.34,
        peers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSM", "AVGO", "QCOM", "MU", "SOXX"],
    },
    {
        symbol: "BTC",
        name: "Bitcoin",
        assetClass: "Crypto",
        price: 94100,
        vol: 0.62,
        nNodes: 13,
        connectivity: 0.55,
        curvature: 0.62,
        peers: ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOT", "LINK", "MATIC", "LTC", "DOGE", "ATOM"],
    },
    {
        symbol: "ETH",
        name: "Ethereum",
        assetClass: "Crypto",
        price: 3420,
        vol: 0.71,
        nNodes: 12,
        connectivity: 0.58,
        curvature: 0.68,
        peers: ["ETH", "BTC", "SOL", "ARB", "OP", "MATIC", "LINK", "UNI", "AAVE", "LDO", "MKR", "ENS"],
    },
    {
        symbol: "SPY",
        name: "SPDR S&P 500 ETF",
        assetClass: "ETF",
        price: 548.7,
        vol: 0.16,
        nNodes: 12,
        connectivity: 0.4,
        curvature: 0.22,
        peers: ["SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "VOO"],
    },
    {
        symbol: "NVDA",
        name: "NVIDIA Corp.",
        assetClass: "Stock",
        price: 121.4,
        vol: 0.45,
        nNodes: 11,
        connectivity: 0.48,
        curvature: 0.51,
        peers: ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "QCOM", "INTC", "ARM", "SMCI", "MRVL"],
    },
    {
        symbol: "GLD",
        name: "Gold (Spot)",
        assetClass: "Commodity",
        price: 2384.5,
        vol: 0.13,
        nNodes: 10,
        connectivity: 0.3,
        curvature: 0.14,
        peers: ["GLD", "SLV", "GDX", "PPLT", "DBC", "USO", "UNG", "COPX", "WEAT", "CORN"],
    },
    {
        symbol: "EURUSD",
        name: "EUR / USD",
        assetClass: "Forex",
        price: 1.082,
        vol: 0.08,
        nNodes: 10,
        connectivity: 0.36,
        curvature: 0.12,
        peers: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "DXY", "EURGBP", "EURJPY"],
    },
    {
        symbol: "TLT",
        name: "20+ Year Treasury",
        assetClass: "Bond",
        price: 94.8,
        vol: 0.15,
        nNodes: 10,
        connectivity: 0.32,
        curvature: 0.16,
        peers: ["TLT", "IEF", "SHY", "AGG", "LQD", "HYG", "TIP", "BND", "MUB", "EMB"],
    },
];

const BY_SYMBOL = TICKER_CATALOG.reduce((acc, t) => {
    acc[t.symbol] = t;
    return acc;
}, {});

/** Infer asset class from a free-form Yahoo symbol. */
const inferAssetClass = (symbol) => {
    const s = (symbol || "").toUpperCase();
    if (s.endsWith("-USD") || ["BTC", "ETH", "SOL"].includes(s)) return "Crypto";
    if (s.endsWith("=X") || (s.includes("USD") && s.length <= 7)) return "Forex";
    if (s.startsWith("^")) return "Index";
    if (["GLD", "SLV", "USO", "UNG"].some((c) => s.startsWith(c))) return "Commodity";
    if (["TLT", "IEF", "AGG", "BND"].some((c) => s.startsWith(c))) return "Bond";
    if (s.endsWith(".MI") || s.endsWith(".DE") || s.endsWith(".L")) return "ETF";
    return "Stock";
};

/**
 * Returns a catalog profile or a dynamic stub for any Yahoo Finance symbol.
 * Returns null when symbol is empty.
 */
export const getTicker = (symbol) => {
    const s = (symbol || "").trim().toUpperCase();
    if (!s) return null;
    if (BY_SYMBOL[s]) return BY_SYMBOL[s];
    return {
        symbol: s,
        name: s,
        assetClass: inferAssetClass(s),
        price: 100,
        vol: 0.28,
        nNodes: 10,
        connectivity: 0.45,
        curvature: 0.3,
        peers: [],
        custom: true,
    };
};

/** Accent colour for a ticker (by its asset class). */
export const tickerAccent = (t) =>
    ASSET_CLASS_ACCENT[t?.assetClass] || "#00E5C0";
