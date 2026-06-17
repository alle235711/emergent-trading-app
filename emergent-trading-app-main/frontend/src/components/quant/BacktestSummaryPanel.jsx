/**
 * Collapsible historical validation summary for model pages.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, LineChart } from "lucide-react";
import {
    ResponsiveContainer,
    LineChart as ReLineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
} from "recharts";
import { fetchBacktestSummary } from "../../lib/api";
import { StatTile, PALETTE } from "./shared/primitives";
import { tooltipStyle } from "./shared/chartTheme";

const BacktestSummaryPanel = ({ ticker, model, modelLabel = "Model" }) => {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!ticker) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchBacktestSummary(ticker, model, { years: 2, horizon: 5 });
            if (res.status === "running") {
                setError("Backtest in progress…");
                setData(null);
            } else {
                setData(res);
            }
        } catch (err) {
            setError(err?.response?.data?.detail ?? err.message ?? "Unavailable");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [ticker, model]);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const sparkData = (data?.cumulative_series ?? []).map((row, i) => ({
        i,
        model: row.model ?? 0,
        benchmark: row.benchmark ?? 0,
    }));

    return (
        <div className="mt-6 border border-[#1B2335] bg-[#0A0F1C]" data-testid="backtest-summary-panel">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
                <span className="text-[12px] font-mono text-slate-300">
                    📊 Validazione storica (ultimi 2 anni)
                </span>
                {open ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
            </button>

            {open && (
                <div className="px-4 pb-4 border-t border-[#1B2335]">
                    <p className="text-[10px] font-mono text-slate-600 mt-3 mb-4 leading-relaxed">
                        Simulated historical performance ≠ future results. Walk-forward 252d train · 21d step.
                    </p>

                    {loading && (
                        <p className="text-[11px] font-mono text-slate-500 animate-pulse">Running walk-forward backtest…</p>
                    )}
                    {error && !loading && (
                        <p className="text-[11px] font-mono text-[#FFB020]">{error}</p>
                    )}

                    {data && !loading && (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                <StatTile
                                    label="Win rate"
                                    value={`${(data.win_rate * 100).toFixed(1)}%`}
                                    tone={data.win_rate >= 0.52 ? "positive" : "warning"}
                                />
                                <StatTile
                                    label="Sharpe"
                                    value={data.sharpe_ratio?.toFixed(2) ?? "—"}
                                    tone={data.sharpe_ratio >= 0.5 ? "positive" : "warning"}
                                />
                                <StatTile
                                    label="Hit rate ±1σ"
                                    value={`${((data.hit_rate_range ?? 0) * 100).toFixed(1)}%`}
                                    tone="neutral"
                                />
                                <StatTile
                                    label="Trades"
                                    value={String(data.n_trades ?? "—")}
                                    tone="neutral"
                                />
                            </div>

                            {sparkData.length > 1 && (
                                <div className="mb-4" style={{ height: 80 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ReLineChart data={sparkData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                            <XAxis dataKey="i" hide />
                                            <YAxis hide domain={["auto", "auto"]} />
                                            <Tooltip
                                                contentStyle={tooltipStyle}
                                                formatter={(v, name) => [`${(v * 100).toFixed(2)}%`, name === "model" ? modelLabel : "Benchmark"]}
                                            />
                                            <Line type="monotone" dataKey="model" stroke={PALETTE.accent} dot={false} strokeWidth={1.5} />
                                            <Line type="monotone" dataKey="benchmark" stroke="#64748B" dot={false} strokeWidth={1} strokeDasharray="4 3" />
                                        </ReLineChart>
                                    </ResponsiveContainer>
                                    <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-slate-600">
                                        <LineChart size={10} />
                                        Cumulative model P&amp;L vs buy &amp; hold
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-[10px] font-mono text-slate-600">
                                    {data.period && `Period: ${data.period}`}
                                    {data.updated_at && ` · Updated ${new Date(data.updated_at).toLocaleString()}`}
                                </span>
                                <Link
                                    to={`/backtest?ticker=${encodeURIComponent(ticker)}&model=${model}`}
                                    className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00E5C0] hover:underline"
                                >
                                    Run full backtest →
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default BacktestSummaryPanel;
