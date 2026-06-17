import React, { useMemo } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import { useTrading } from "../../context/TradingContext";

/**
 * Capital Trajectory chart.
 * --------------------------------------------------------------------------
 * Shows three things on the same time axis:
 *
 *   1. The user's **paper-trading equity curve** (real, derived from
 *      `capitalSnapshots` in TradingContext) — the "Actual" line.
 *   2. Three deterministic projection scenarios (conservative / base / bull)
 *      built off the current portfolio value with compounded growth, so the
 *      user can eyeball long-term trajectories.
 *
 * Pure mock projection — no statistics, no live API. UI only, per spec.
 */

const SCENARIOS = [
    { key: "bear", cagr: 0.03, color: "#FF3B30", label: "Bear · 3%" },
    { key: "base", cagr: 0.08, color: "#00E5C0", label: "Base · 8%" },
    { key: "bull", cagr: 0.14, color: "#FFB020", label: "Bull · 14%" },
];

const HORIZON_YEARS = 10;
const POINTS = 40; // ≈ quarterly resolution over 10y

const formatMoneyShort = (v) => {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return v.toFixed(0);
};

const CapitalTrajectoryChart = () => {
    const { capitalSnapshots, portfolioValue, currency } = useTrading();

    const data = useMemo(() => {
        const start = capitalSnapshots[0]?.equity ?? portfolioValue;
        const now = portfolioValue;
        const stepMonths = (HORIZON_YEARS * 12) / POINTS;

        // Time anchor: first snapshot's date if any, otherwise now-rolled-back 1y
        const anchorDate = capitalSnapshots[0]?.date
            ? new Date(capitalSnapshots[0].date)
            : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

        // Project scenarios from "now" forward
        const projection = [];
        for (let i = 0; i <= POINTS; i += 1) {
            const months = i * stepMonths;
            const t = months / 12; // years
            const date = new Date(
                Date.now() + months * 30 * 24 * 60 * 60 * 1000,
            );
            const row = { date: date.toISOString().slice(0, 10) };
            SCENARIOS.forEach((s) => {
                row[s.key] = now * Math.pow(1 + s.cagr, t);
            });
            projection.push(row);
        }

        // Actual: anchor + each snapshot's equity, ending at `now`
        const actualSeries = [
            { date: anchorDate.toISOString().slice(0, 10), actual: start },
            ...capitalSnapshots.map((s) => ({
                date: s.date.slice(0, 10),
                actual: s.equity,
            })),
            { date: new Date().toISOString().slice(0, 10), actual: now },
        ];

        // Merge actual + projection by date, keep order
        const merged = [
            ...actualSeries,
            ...projection.map((p) => ({ ...p })),
        ].sort((a, b) => (a.date > b.date ? 1 : -1));

        return merged;
    }, [capitalSnapshots, portfolioValue]);

    return (
        <section
            className="border border-[#222222] bg-[#0F0F0F]"
            data-testid="capital-trajectory-section"
        >
            <header className="border-b border-[#222222] px-5 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // Capital trajectory
                    </div>
                    <h2 className="text-lg sm:text-xl font-mono mt-1">
                        Equity curve · 10y projection
                    </h2>
                </div>
                <div className="flex items-center gap-6 text-[11px] font-mono uppercase tracking-[0.2em]">
                    <div>
                        <div className="text-neutral-500">Current equity</div>
                        <div
                            className="text-white text-sm mt-1 normal-case tracking-normal"
                            data-testid="capital-current-equity"
                        >
                            {new Intl.NumberFormat("it-IT", {
                                style: "currency",
                                currency: currency === "€" ? "EUR" : "USD",
                                maximumFractionDigits: 2,
                            }).format(portfolioValue)}
                        </div>
                    </div>
                </div>
            </header>

            <div className="p-4 sm:p-6">
                <div className="w-full h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="grad-actual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00E5C0" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#00E5C0" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1A1A1A" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#444444"
                                tick={{ fill: "#666666", fontSize: 11 }}
                                tickFormatter={(d) => (d || "").slice(0, 7)}
                                minTickGap={32}
                            />
                            <YAxis
                                stroke="#444444"
                                tick={{ fill: "#666666", fontSize: 11 }}
                                tickFormatter={formatMoneyShort}
                                width={56}
                                domain={["auto", "auto"]}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "rgba(10,10,10,0.92)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: 11,
                                }}
                                formatter={(value) =>
                                    new Intl.NumberFormat("it-IT", {
                                        style: "currency",
                                        currency: currency === "€" ? "EUR" : "USD",
                                        maximumFractionDigits: 0,
                                    }).format(value)
                                }
                                labelStyle={{ color: "#999" }}
                            />
                            <Legend
                                wrapperStyle={{
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: 10,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.2em",
                                    color: "#666",
                                }}
                            />

                            <Area
                                type="monotone"
                                dataKey="actual"
                                name="Actual"
                                stroke="#00E5C0"
                                strokeWidth={2}
                                fill="url(#grad-actual)"
                                isAnimationActive={false}
                                connectNulls
                            />
                            {SCENARIOS.map((s) => (
                                <Line
                                    key={s.key}
                                    type="monotone"
                                    dataKey={s.key}
                                    name={s.label}
                                    stroke={s.color}
                                    strokeDasharray="4 4"
                                    strokeWidth={1.4}
                                    dot={false}
                                    isAnimationActive={false}
                                    connectNulls
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                    // Projection lines are deterministic illustrations (compound
                    growth) · not forecasts
                </div>
            </div>
        </section>
    );
};

export default CapitalTrajectoryChart;
