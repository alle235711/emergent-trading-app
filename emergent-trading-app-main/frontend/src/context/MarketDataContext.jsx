import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { useTicker } from "./TickerContext";
import { useMarketStream } from "../hooks/useMarketStream";
import { toYahooSymbol } from "../lib/tickerSymbol";

const MarketDataContext = createContext(null);

/**
 * MarketDataContext — global LIVE price feed for the active ticker.
 *
 * Combines the WebSocket hybrid stream (Part 1) with a REST quote fallback so
 * the UI always shows the latest available mark — even when the market is
 * closed (Yahoo last close ≈ broker quote).
 */
export const MarketDataProvider = ({ children }) => {
    const { symbol, hasTicker } = useTicker();
    const yahoo = hasTicker ? toYahooSymbol(symbol) : null;
    const { status, tick, last, history, error } = useMarketStream(symbol, { enabled: hasTicker });

    const [restQuote, setRestQuote] = useState(null);

    const fetchRestQuote = useCallback(async () => {
        if (!hasTicker || !symbol) return;
        try {
            const base = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
            const res = await fetch(`${base}/api/paper/quote?ticker=${encodeURIComponent(symbol)}`);
            if (!res.ok) return;
            const data = await res.json();
            setRestQuote(data);
        } catch {
            /* backend offline */
        }
    }, [symbol, hasTicker]);

    useEffect(() => {
        if (!hasTicker) {
            setRestQuote(null);
            return undefined;
        }
        setRestQuote(null);
        fetchRestQuote();
        const id = setInterval(fetchRestQuote, 60_000);
        return () => clearInterval(id);
    }, [symbol, hasTicker, fetchRestQuote]);

    const value = useMemo(() => {
        const ibkrConnected = Boolean(tick?.ibkr_connected ?? restQuote?.ibkr_connected);
        // When broker is disconnected, use ONLY Yahoo delayed REST quotes — not WS synthetic ticks.
        const livePrice = ibkrConnected
            ? (last ?? restQuote?.price ?? null)
            : (restQuote?.price ?? null);
        const effectiveSource = ibkrConnected
            ? (tick?.source ?? restQuote?.source ?? null)
            : (restQuote?.source ?? "yahoo-delayed");
        const brokerDisconnected = !ibkrConnected;
        return {
            symbol,
            yahoo,
            status: brokerDisconnected ? "closed" : status,
            error,
            tick: brokerDisconnected ? null : tick,
            lastPrice: livePrice,
            changePct: ibkrConnected ? (tick?.change_pct ?? null) : null,
            history,
            source: effectiveSource,
            ibkrConnected,
            brokerDisconnected,
            priceDelayed: brokerDisconnected || Boolean(restQuote?.delayed),
            delayNote: restQuote?.delay_note ?? (
                brokerDisconnected
                    ? "Yahoo Finance delayed prices (15–20 min). Not suitable for real execution."
                    : null
            ),
            refreshQuote: fetchRestQuote,
        };
    }, [symbol, yahoo, status, error, tick, last, restQuote, history, fetchRestQuote]);

    return (
        <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>
    );
};

export const useMarketData = () => {
    const ctx = useContext(MarketDataContext);
    if (!ctx) {
        throw new Error("useMarketData must be used inside <MarketDataProvider>");
    }
    return ctx;
};
