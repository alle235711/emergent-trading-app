import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { getTicker } from "../lib/tickers";
import { pushRecentTicker } from "../lib/recentTickers";

/**
 * TickerContext — the GLOBAL active-instrument regime.
 * No default ticker: the user must pick one on first load (TickerWelcomeScreen).
 */

const TickerContext = createContext(null);

const STORAGE_TICKER = "quantdesk.ticker";

const readTicker = () => {
    try {
        const raw = localStorage.getItem(STORAGE_TICKER);
        const s = (raw || "").trim().toUpperCase();
        return s || null;
    } catch {
        return null;
    }
};

export const TickerProvider = ({ children }) => {
    const [symbol, setSymbolState] = useState(readTicker);
    const [changeToken, setChangeToken] = useState(0);

    useEffect(() => {
        try {
            if (symbol) {
                localStorage.setItem(STORAGE_TICKER, symbol);
            } else {
                localStorage.removeItem(STORAGE_TICKER);
            }
        } catch {
            /* quota / private mode — ignore */
        }
    }, [symbol]);

    const setTicker = useCallback((next, meta = {}) => {
        const s = (next || "").trim().toUpperCase();
        if (!s) return;
        pushRecentTicker(s, meta);
        setSymbolState(s);
        setChangeToken((t) => t + 1);
    }, []);

    const clearTicker = useCallback(() => {
        setSymbolState(null);
        setChangeToken((t) => t + 1);
    }, []);

    const value = useMemo(() => {
        const hasTicker = Boolean(symbol);
        const ticker = hasTicker ? getTicker(symbol) : null;
        return {
            symbol: symbol ?? null,
            ticker,
            hasTicker,
            setTicker,
            clearTicker,
            changeToken,
        };
    }, [symbol, setTicker, clearTicker, changeToken]);

    return (
        <TickerContext.Provider value={value}>{children}</TickerContext.Provider>
    );
};

export const useTicker = () => {
    const ctx = useContext(TickerContext);
    if (!ctx) {
        throw new Error("useTicker must be used inside <TickerProvider>");
    }
    return ctx;
};
