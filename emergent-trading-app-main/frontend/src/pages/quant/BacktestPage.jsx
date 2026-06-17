/**
 * BacktestPage.jsx — Walk-forward model validation dashboard
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";
import { Play, RefreshCw, AlertTriangle } from "lucide-react";

import {
    PageHeader,
    Panel,
    StatTile,
    Gauge,
    PALETTE,
} from "../../components/quant/shared/primitives";
import { axisCommon, tooltipStyle, gridStroke } from "../../components/quant/shared/chartTheme";
import { fetchBacktest, fetchBacktestProgress } from "../../lib/api";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { SafeChart } from "../../components/quant/shared/ChartErrorBoundary";

const MODEL_OPTIONS = [
    { id: "ensemble_sde", label: "Ensemble SDE Forecast" },
    { id: "sheaf", label: "Sheaf Cross-Asset Residual" },
];

const HORIZON_OPTIONS = [1, 5, 10, 21];

const defaultEnd = () => new Date().toISOString().slice(0, 10);
const defaultStart = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
};

const BacktestPage = () => {
    const [params] = useSearchParams();
    const [ticker, setTicker] = useState(params.get("ticker") || "SPY");
    const [model, setModel] = useState(params.get("model") || "ensemble_sde");
    const [start, setStart] = useState("2022-01-01");
    const [end, setEnd] = useState(defaultEnd());
    const [horizon, setHorizon] = useState(5);

    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);

    const pollProgress = useCallback(async () => {
        try {
            const p = await fetchBacktestProgress();
            setProgress(p.progress ?? 0);
            return p.status === "running";
        } catch {
            return false;
        }
    }, []);

    const run = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        setProgress(0);

        const pollId = setInterval(async () => {
            await pollProgress();
        }, 1500);

        try {
            const data = await fetchBacktest({ ticker, model, start, end, horizon });
            setResult(data);
        } catch (err) {
            if (err?.response?.status === 409) {
                setError("Backtest already running — polling progress…");
                let attempts = 0;
                while (attempts < 120) {
                    await new Promise((r) => setTimeout(r, 2000));
                    await pollProgress();
                    attempts += 1;
                    try {
                        const data = await fetchBacktest({ ticker, model, start, end, horizon });
                        setResult(data);
                        setError(null);
                        break;
                    } catch (e) {
                        if (e?.response?.status !== 409) {
                            setError(e?.response?.data?.detail ?? e.message);
                            break;
                        }
                    }
                }
            } else {
                setError(err?.response?.data?.detail ?? err.message ?? "Backtest failed");
            }
        } finally {
            clearInterval(pollId);
            setLoading(false);
            setProgress(1);
        }
    }, [ticker, model, start, end, horizon, pollProgress]);

    useEffect(() => {
        if (params.get("ticker") || params.get("model")) {
            run();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const sharpeBar = useMemo(() => {
        if (!result) return [];
        return [
            { name: "Model", value: result.sharpe_ratio ?? 0, fill: PALETTE.accent },
            { name: "Buy & Hold", value: result.benchmark_sharpe ?? 0, fill: "#64748B" },
        ];
    }, [result]);

    const cumulativeChart = useMemo(() => {
        const series = result?.cumulative_series ?? [];
        return series.map((row, i) => ({
            i,
            date: row.date,
            model: 1 + (row.model ?? 0),
            benchmark: 1 + (row.benchmark ?? 0),
        }));
    }, [result]);

    const showWeakBanner = result && (result.sharpe_ratio < 0.5 || result.win_rate < 0.52);
    const showStrongBanner = result && result.sharpe_ratio > 1.0 && result.win_rate > 0.55;

    return (
        <div data-testid="backtest-page">
            <PageHeader
                title="Walk-Forward Backtest"
                subtitle="Rigorous out-of-sample validation · 252d train · 21d step · no look-ahead"
                actions={<DataSourceBadge source={result ? "live" : "idle"} />}
            />

            <Panel title="Controls" subtitle="Configure walk-forward parameters" className="mb-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <label className="block">
                        <span className="block text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">Ticker</span>
                        <input
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())}
                            className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm font-mono text-white"
                        />
                    </label>
                    <label className="block">
                        <span className="block text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">Model</span>
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm font-mono text-white"
                        >
                            {MODEL_OPTIONS.map((m) => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="block text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">Start</span>
                        <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                            className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm font-mono text-white" />
                    </label>
                    <label className="block">
                        <span className="block text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">End</span>
                        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                            className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm font-mono text-white" />
                    </label>
                    <label className="block">
                        <span className="block text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">Horizon (days)</span>
                        <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}
                            className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm font-mono text-white">
                            {HORIZON_OPTIONS.map((h) => <option key={h} value={h}>{h}d</option>)}
                        </select>
                    </label>
                </div>
                <button
                    type="button"
                    onClick={run}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] bg-[#00E5C0] text-black hover:bg-[#00E5C0]/90 disabled:opacity-50"
                >
                    {loading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {loading ? `Running ${(progress * 100).toFixed(0)}%` : "Run backtest"}
                </button>
            </Panel>

            <p className="text-[10px] font-mono text-slate-600 mb-4 px-1">
                ⚠ Simulated historical performance ≠ future results. Walk-forward only — no future data used for calibration.
            </p>

            {error && (
                <div className="mb-4 px-4 py-3 border border-[#FF4D5E]/40 bg-[#FF4D5E]/10 text-[11px] font-mono text-[#FF4D5E]">
                    {error}
                </div>
            )}

            {result?.warnings?.length > 0 && (
                <div className="mb-4 px-4 py-3 border border-[#FFB020]/40 bg-[#FFB020]/10 text-[11px] font-mono text-[#FFB020]">
                    {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
            )}

            {showWeakBanner && (
                <div className="mb-4 px-4 py-3 border border-[#FF4D5E]/50 bg-[#FF4D5E]/15 flex items-start gap-2 text-[11px] font-mono text-[#FF4D5E]">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    Model shows no statistically significant edge in this period
                </div>
            )}

            {showStrongBanner && (
                <div className="mb-4 px-4 py-3 border border-[#FFB020]/50 bg-[#FFB020]/15 flex items-start gap-2 text-[11px] font-mono text-[#FFB020]">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    Results look strong — verify this is not overfitting to this specific period
                </div>
            )}

            {result && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                        <Panel title="Win Rate" subtitle="vs 50% baseline" testId="gauge-win-rate">
                            <Gauge value={result.win_rate ?? 0} label={`${((result.win_rate ?? 0) * 100).toFixed(1)}%`} />
                            <p className="text-center text-[10px] font-mono text-slate-600 mt-1">Baseline 50%</p>
                        </Panel>

                        <Panel title="Sharpe Ratio" subtitle="vs Buy & Hold benchmark" testId="bar-sharpe">
                            <SafeChart height={160}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={sharpeBar} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                                        <XAxis dataKey="name" {...axisCommon} />
                                        <YAxis {...axisCommon} width={36} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Bar dataKey="value" radius={0}>
                                            {sharpeBar.map((entry, i) => (
                                                <Cell key={i} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </SafeChart>
                        </Panel>

                        <Panel title="Cumulative Return" subtitle="Model vs benchmark" testId="line-cumulative">
                            <SafeChart height={160}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={cumulativeChart} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                                        <XAxis dataKey="date" {...axisCommon} tickFormatter={(v) => v?.slice(5)} />
                                        <YAxis {...axisCommon} width={44} domain={["auto", "auto"]} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Line type="monotone" dataKey="model" name="Model" stroke={PALETTE.accent} dot={false} strokeWidth={1.5} />
                                        <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#64748B" dot={false} strokeWidth={1} strokeDasharray="4 3" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </SafeChart>
                        </Panel>

                        <Panel title="Range Hit Rate" subtitle="±1σ calibration" testId="gauge-range">
                            <Gauge
                                value={result.hit_rate_range ?? 0}
                                label={`${((result.hit_rate_range ?? 0) * 100).toFixed(1)}%`}
                            />
                            <p className="text-center text-[10px] font-mono text-slate-600 mt-1">
                                Expected ~68% · {result.calibration_score}
                            </p>
                        </Panel>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <StatTile label="Trades" value={String(result.n_trades)} />
                        <StatTile label="Model return" value={`${((result.model_return ?? 0) * 100).toFixed(2)}%`} />
                        <StatTile label="Benchmark return" value={`${((result.benchmark_return ?? 0) * 100).toFixed(2)}%`} />
                        <StatTile label="Max drawdown" value={`${((result.max_drawdown ?? 0) * 100).toFixed(2)}%`} tone="warning" />
                    </div>

                    <Panel title="Trade Log" subtitle="Walk-forward step-by-step" testId="trade-table">
                        <div className="overflow-x-auto">
                            <table className="w-full font-mono text-[11px]">
                                <thead className="text-slate-500 text-[10px] uppercase tracking-[0.2em]">
                                    <tr>
                                        <th className="text-left pb-3 pr-4 font-normal">Date</th>
                                        <th className="text-center pb-3 px-2 font-normal">Predicted</th>
                                        <th className="text-center pb-3 px-2 font-normal">Actual</th>
                                        <th className="text-center pb-3 px-2 font-normal">Hit</th>
                                        <th className="text-right pb-3 pl-4 font-normal">Return</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(result.trades ?? []).filter((t) => t.signal !== "no_trade").map((t, i) => (
                                        <tr key={i} className="border-t border-[#1B2335] hover:bg-white/[0.02]">
                                            <td className="py-2 pr-4 text-slate-400">{t.date}</td>
                                            <td className="text-center py-2 px-2 text-[#00E5C0]">{t.predicted_direction}</td>
                                            <td className="text-center py-2 px-2">{t.actual_direction}</td>
                                            <td className="text-center py-2 px-2">
                                                {t.direction_hit == null ? "—" : t.direction_hit ? "✓" : "✗"}
                                            </td>
                                            <td className={`text-right py-2 pl-4 ${(t.return ?? 0) >= 0 ? "text-[#00E5C0]" : "text-[#FF4D5E]"}`}>
                                                {t.return != null ? `${(t.return * 100).toFixed(2)}%` : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </>
            )}
        </div>
    );
};

export default BacktestPage;
