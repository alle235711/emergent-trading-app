import { useEffect, useRef, useState } from "react";

import { marketStreamUrl } from "../lib/api";

/**
 * useMarketStream
 * ────────────────────────────────────────────────────────────────────────────
 * Subscribe to the hybrid market feed for a single ticker:
 *   • the backend first pushes an OHLCV `snapshot` (yfinance history);
 *   • then a continuous flow of `tick` messages from the simulated IBKR paper
 *     stream (services/market_data.IBKRPaperStream).
 *
 * Returns a stable view-model:
 *   { status, last, tick, history, error }
 *     status  – "connecting" | "live" | "closed" | "error"
 *     last    – latest price (number | null)
 *     tick    – full latest tick payload (price, bid, ask, change_pct, …)
 *     history – array of OHLCV candles from the snapshot
 *
 * Reconnects automatically with a capped backoff when the socket drops.
 */
export function useMarketStream(ticker, { enabled = true } = {}) {
    const [status, setStatus] = useState("connecting");
    const [tick, setTick] = useState(null);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);

    const wsRef = useRef(null);
    const retryRef = useRef(0);
    const closedByUs = useRef(false);
    const reconnectTimer = useRef(null);

    useEffect(() => {
        if (!ticker || !enabled) return undefined;

        closedByUs.current = false;
        let cancelled = false;

        const connect = () => {
            if (cancelled) return;
            setStatus("connecting");

            let ws;
            try {
                ws = new WebSocket(marketStreamUrl(ticker));
            } catch (e) {
                setStatus("error");
                setError(String(e));
                return;
            }
            wsRef.current = ws;

            ws.onopen = () => {
                retryRef.current = 0;
                setStatus("live");
                setError(null);
            };

            ws.onmessage = (evt) => {
                let msg;
                try {
                    msg = JSON.parse(evt.data);
                } catch {
                    return;
                }
                if (msg.type === "snapshot") {
                    setHistory(Array.isArray(msg.candles) ? msg.candles : []);
                } else if (msg.type === "tick") {
                    setTick(msg);
                }
                // heartbeat → ignore
            };

            ws.onerror = () => {
                setStatus("error");
                setError("WebSocket error");
            };

            ws.onclose = () => {
                if (cancelled || closedByUs.current) {
                    setStatus("closed");
                    return;
                }
                // Exponential backoff capped at 10s.
                const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
                retryRef.current += 1;
                setStatus("connecting");
                reconnectTimer.current = setTimeout(connect, delay);
            };
        };

        connect();

        return () => {
            cancelled = true;
            closedByUs.current = true;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                try {
                    wsRef.current.close();
                } catch {
                    /* ignore */
                }
            }
        };
    }, [ticker, enabled]);

    return {
        status,
        tick,
        last: tick ? tick.price : null,
        history,
        error,
    };
}

export default useMarketStream;
