const STORAGE_KEY = "quant_desk_recent_tickers";
const MAX_RECENT = 5;

export function readRecentTickers() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = JSON.parse(raw || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((x) => (typeof x === "string" ? x : x?.symbol))
            .filter(Boolean)
            .map((s) => s.trim().toUpperCase())
            .slice(0, MAX_RECENT);
    } catch {
        return [];
    }
}

export function pushRecentTicker(symbol, meta = {}) {
    const sym = (symbol || "").trim().toUpperCase();
    if (!sym) return readRecentTickers();
    const prev = readRecentTickers().filter((s) => s !== sym);
    const next = [{ symbol: sym, ...meta }, ...prev.map((s) => ({ symbol: s }))].slice(0, MAX_RECENT);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    return next.map((x) => x.symbol);
}
