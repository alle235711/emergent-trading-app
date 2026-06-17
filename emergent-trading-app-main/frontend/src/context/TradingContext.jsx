import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

/**
 * Trading context — pure client-side simulation state.
 * --------------------------------------------------------------------------
 * Mode:
 *   • "real" → SUBMIT_ORDER is a no-op (just a console.log); no broker is
 *               actually connected (per product spec).
 *   • "paper" → SUBMIT_ORDER mutates a local cash balance + positions list
 *               + equity-curve snapshots so the user can paper-trade.
 *
 * Persistence: every piece of state is mirrored to localStorage so the
 * simulation survives page reloads and route changes (Dashboard ↔ Portfolio).
 *
 * IMPORTANT: this layer is intentionally frontend-only. The day we wire a
 * real broker we'll swap `submitOrder` for an API call while keeping the
 * same shape for downstream consumers.
 */

const TradingContext = createContext(null);

const STORAGE_MODE = "quantdesk.trading.mode";
const STORAGE_BALANCE = "quantdesk.trading.balance";
const STORAGE_POSITIONS = "quantdesk.trading.positions";
const STORAGE_EQUITY = "quantdesk.trading.equity";

const INITIAL_BALANCE = 50000; // € — per spec
const CURRENCY = "€";

const SEED_POSITIONS = [
    {
        id: "seed-aapl",
        ticker: "AAPL",
        assetClass: "Stock",
        side: "buy",
        shares: 25,
        avgPrice: 178.4,
        lastPrice: 211.27,
        seeded: true,
        addedAt: "2025-09-12T09:30:00Z",
    },
    {
        id: "seed-swda",
        ticker: "SWDA.MI",
        assetClass: "ETF",
        side: "buy",
        shares: 60,
        avgPrice: 102.6,
        lastPrice: 120.39,
        seeded: true,
        addedAt: "2025-04-04T08:15:00Z",
    },
    {
        id: "seed-btc",
        ticker: "BTC-USD",
        assetClass: "Crypto",
        side: "buy",
        shares: 0.45,
        avgPrice: 58320.0,
        lastPrice: 94100.0,
        seeded: true,
        addedAt: "2025-02-20T12:00:00Z",
    },
    {
        id: "seed-eurusd",
        ticker: "EURUSD=X",
        assetClass: "Forex",
        side: "buy",
        shares: 10000,
        avgPrice: 1.072,
        lastPrice: 1.1658,
        seeded: true,
        addedAt: "2026-01-10T10:00:00Z",
    },
    {
        id: "seed-nvda",
        ticker: "NVDA",
        assetClass: "Stock",
        side: "buy",
        shares: 15,
        avgPrice: 451.2,
        lastPrice: 386.55,
        seeded: true,
        addedAt: "2025-11-22T14:45:00Z",
    },
];

const readJSON = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const writeJSON = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* quota / private mode — silently ignore */
    }
};

const newOrderId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const classifyTicker = (t) => {
    if (!t) return "Asset";
    if (t.endsWith("-USD")) return "Crypto";
    if (t.endsWith("=X")) return "Forex";
    if (t.startsWith("^")) return "Index";
    if (t.includes(".")) return "ETF";
    return "Stock";
};

const computePortfolioValue = (cash, positions) => {
    const market = positions.reduce(
        (acc, p) => acc + (p.lastPrice || p.avgPrice) * p.shares,
        0,
    );
    return cash + market;
};

export const TradingProvider = ({ children }) => {
    const [mode, setModeState] = useState(
        () => readJSON(STORAGE_MODE, "real") || "real",
    );
    const [simulatedBalance, setSimulatedBalance] = useState(() =>
        readJSON(STORAGE_BALANCE, INITIAL_BALANCE),
    );
    const [simulatedPositions, setSimulatedPositions] = useState(() =>
        readJSON(STORAGE_POSITIONS, SEED_POSITIONS),
    );
    const [capitalSnapshots, setCapitalSnapshots] = useState(() => {
        const stored = readJSON(STORAGE_EQUITY, null);
        if (stored && Array.isArray(stored) && stored.length) return stored;
        const bal = readJSON(STORAGE_BALANCE, INITIAL_BALANCE);
        const pos = readJSON(STORAGE_POSITIONS, SEED_POSITIONS);
        return [
            {
                date: new Date().toISOString(),
                equity: computePortfolioValue(bal, pos),
                label: "open",
            },
        ];
    });

    // Persist on every mutation
    useEffect(() => writeJSON(STORAGE_MODE, mode), [mode]);
    useEffect(() => writeJSON(STORAGE_BALANCE, simulatedBalance), [simulatedBalance]);
    useEffect(
        () => writeJSON(STORAGE_POSITIONS, simulatedPositions),
        [simulatedPositions],
    );
    useEffect(() => writeJSON(STORAGE_EQUITY, capitalSnapshots), [capitalSnapshots]);

    const setMode = useCallback((next) => {
        setModeState(next === "paper" ? "paper" : "real");
    }, []);

    /**
     * Execute an order.
     * In REAL mode: emit a console.log (no broker connected).
     * In PAPER mode: mutate balance + positions and append a capital snapshot.
     *
     * Returns { ok: bool, message: string, executedPrice?: number }
     */
    const submitOrder = useCallback(
        ({ ticker, currentPrice, quantity, side, orderType, limitPrice }) => {
            const qty = Number(quantity);
            const px = Number(currentPrice);
            const tk = (ticker || "").toString().trim().toUpperCase();

            if (!tk) return { ok: false, message: "Ticker missing" };
            if (!Number.isFinite(qty) || qty <= 0)
                return { ok: false, message: "Quantity must be > 0" };
            if (!Number.isFinite(px) || px <= 0)
                return { ok: false, message: "Live price unavailable" };

            const orderPayload = {
                ticker: tk,
                side,
                orderType,
                quantity: qty,
                limitPrice: Number(limitPrice) || null,
                referencePrice: px,
                mode,
                submittedAt: new Date().toISOString(),
            };

            // REAL mode — for now just console.log (per spec)
            if (mode === "real") {
                // eslint-disable-next-line no-console
                console.log("[QuantDesk] REAL ORDER (no broker connected) →", orderPayload);
                return {
                    ok: true,
                    message: "Order logged (no broker connected)",
                    executedPrice: px,
                };
            }

            // PAPER mode — mutate state
            const cost = px * qty;
            if (side === "buy" && cost > simulatedBalance) {
                return {
                    ok: false,
                    message: "Insufficient simulated balance",
                };
            }

            setSimulatedPositions((prev) => {
                const idx = prev.findIndex(
                    (p) => p.ticker === tk && !p.closed,
                );

                if (side === "buy") {
                    if (idx >= 0) {
                        const ex = prev[idx];
                        const newShares = ex.shares + qty;
                        const newAvg =
                            (ex.shares * ex.avgPrice + qty * px) / newShares;
                        const updated = {
                            ...ex,
                            shares: newShares,
                            avgPrice: newAvg,
                            lastPrice: px,
                            updatedAt: orderPayload.submittedAt,
                        };
                        return [
                            ...prev.slice(0, idx),
                            updated,
                            ...prev.slice(idx + 1),
                        ];
                    }
                    return [
                        ...prev,
                        {
                            id: newOrderId(),
                            ticker: tk,
                            assetClass: classifyTicker(tk),
                            side: "buy",
                            shares: qty,
                            avgPrice: px,
                            lastPrice: px,
                            addedAt: orderPayload.submittedAt,
                        },
                    ];
                }

                // SELL
                if (idx < 0) {
                    return prev; // can't sell what you don't have in this MVP
                }
                const ex = prev[idx];
                if (qty >= ex.shares) {
                    // close fully
                    return [
                        ...prev.slice(0, idx),
                        ...prev.slice(idx + 1),
                    ];
                }
                const updated = {
                    ...ex,
                    shares: ex.shares - qty,
                    lastPrice: px,
                    updatedAt: orderPayload.submittedAt,
                };
                return [
                    ...prev.slice(0, idx),
                    updated,
                    ...prev.slice(idx + 1),
                ];
            });

            // Update balance — use functional update for safety against
            // rapid double-submits (don't read a stale closure value).
            setSimulatedBalance((prev) =>
                side === "buy" ? prev - cost : prev + cost,
            );

            // Append equity snapshot AFTER positions update — use the (about-to-be)
            // updated arrays. Since setSimulatedPositions hasn't flushed yet we
            // approximate with the cost delta.
            setCapitalSnapshots((prev) => {
                const last = prev[prev.length - 1];
                const lastEquity = last ? last.equity : INITIAL_BALANCE;
                // For BUY the cash drops by `cost` but position value rises by `cost`
                // → net equity stays the same at the instant of execution.
                // For SELL the position drops by `cost` and cash rises by `cost`
                // → also net-flat. So we just append a flat snapshot tagged with
                // the trade, the curve will move when lastPrice gets refreshed.
                return [
                    ...prev,
                    {
                        date: orderPayload.submittedAt,
                        equity: lastEquity,
                        label: `${side.toUpperCase()} ${tk} × ${qty}`,
                    },
                ];
            });

            return {
                ok: true,
                message: `Paper ${side.toUpperCase()} executed @ ${px.toFixed(4)}`,
                executedPrice: px,
            };
        },
        [mode, simulatedBalance],
    );

    /**
     * Refresh `lastPrice` for a position when the user is browsing that
     * ticker on the dashboard. Keeps the portfolio P&L in sync without an
     * extra polling loop.
     */
    const refreshLastPrice = useCallback((ticker, price) => {
        if (!ticker || !Number.isFinite(Number(price))) return;
        setSimulatedPositions((prev) =>
            prev.map((p) =>
                p.ticker === ticker ? { ...p, lastPrice: Number(price) } : p,
            ),
        );
    }, []);

    const resetSimulation = useCallback(() => {
        setSimulatedBalance(INITIAL_BALANCE);
        setSimulatedPositions(SEED_POSITIONS);
        setCapitalSnapshots([
            {
                date: new Date().toISOString(),
                equity: computePortfolioValue(INITIAL_BALANCE, SEED_POSITIONS),
                label: "reset",
            },
        ]);
    }, []);

    const portfolioValue = useMemo(
        () => computePortfolioValue(simulatedBalance, simulatedPositions),
        [simulatedBalance, simulatedPositions],
    );

    const value = useMemo(
        () => ({
            mode,
            setMode,
            isPaper: mode === "paper",
            currency: CURRENCY,
            initialBalance: INITIAL_BALANCE,
            simulatedBalance,
            simulatedPositions,
            capitalSnapshots,
            portfolioValue,
            submitOrder,
            refreshLastPrice,
            resetSimulation,
        }),
        [
            mode,
            setMode,
            simulatedBalance,
            simulatedPositions,
            capitalSnapshots,
            portfolioValue,
            submitOrder,
            refreshLastPrice,
            resetSimulation,
        ],
    );

    return (
        <TradingContext.Provider value={value}>{children}</TradingContext.Provider>
    );
};

export const useTrading = () => {
    const ctx = useContext(TradingContext);
    if (!ctx) {
        throw new Error("useTrading must be used inside <TradingProvider>");
    }
    return ctx;
};
