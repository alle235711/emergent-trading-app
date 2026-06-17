/**
 * EnsembleSdeForecastPage.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Ensemble SDE Forecast — GBM · Mean-Reverting OU · Jump-Diffusion.
 *
 * DATA FLOW
 *   1. Mount  → fetchEnsembleSdeForecast(ticker, period, { forecast_horizon })
 *   2. Adapter → normalise backend shape into the internal chart contract
 *   3. Error/timeout → fall back to buildEnsembleForecast() mock, badge = MOCK
 *
 * BACKEND CONTRACT  (POST /api/forecast/ensemble-sde)
 *   result.meta               { s0, n_observations, forecast_horizon, n_paths }
 *   result.gbm                { mean[H], q05[H], q95[H] }   step-level fan data
 *   result.predictive_distribution  { horizons[m], quantiles.{q05,q25,q50,q75,q95}[m] }
 *   result.dynamic_var        { alpha, horizons[m], var[m], cvar[m] }
 *   result.risk_scenarios     { bear, base, bull }
 *   result.particle_filter    { model_weights:{gbm,ou,jump}, effective_sample_size }
 *   result.trajectories       { sample_paths[k][H+1], n_paths, horizon }
 *   result.support_violation  { levels[K], probabilities[K][m], horizons[m] }
 */

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import {
    ResponsiveContainer,
    ComposedChart,
    AreaChart,
    Area,
    Line,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ZAxis,
} from "recharts";
import { RefreshCw, Wifi, WifiOff, ChevronDown } from "lucide-react";

import {
    PageHeader,
    Panel,
    StatTile,
    Legend,
    PALETTE,
} from "../../components/quant/shared/primitives";
import { fetchEnsembleSdeForecast } from "../../lib/api";
import BacktestSummaryPanel from "../../components/quant/BacktestSummaryPanel";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { SafeChart } from "../../components/quant/shared/ChartErrorBoundary";
import { useDemoMode } from "../../context/DemoModeContext";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { getProfile } from "../../lib/horizon";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";

// ─── shared chart styles ────────────────────────────────────────────────────

const axisCommon = {
    stroke: "#2A3550",
    tick: { fill: "#64748B", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
    tickLine: { stroke: "#1B2335" },
};

const tooltipStyle = {
    background: "#0A0F1C",
    border: "1px solid #2A3550",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
    color: "#E6EAF2",
    borderRadius: 0,
};

// ─── quick-pick controls config ─────────────────────────────────────────────

const PERIOD_OPTIONS = ["6mo", "1y", "2y", "5y"];
/** Backend accepts forecast_horizon ∈ [5, 60]. */
const HORIZON_OPTIONS = [5, 10, 20, 30, 60];
const clampForecastHorizon = (h) => Math.min(60, Math.max(5, Math.round(h)));

// ─── API response → internal chart format adapter ───────────────────────────

/**
 * Transforms the raw backend payload into the internal chart format.
 *
 * Fan chart contract  (one row per forecast step t = 0…H):
 *   { t, _base, b_05_25, b_25_50, b_50_75, b_75_95, q50, q05, q95 }
 *
 * The backend's `result.gbm` gives step-level q05 / q50 / q95 for all H steps.
 * We derive q25 ≈ (q05+q50)/2 and q75 ≈ (q50+q95)/2 — reasonable for a
 * log-normal ensemble; we label them "~q25/~q75" in the legend.
 */
function adaptApiResponse(payload) {
    const r = payload.result;
    const s0 = r.meta?.s0 ?? 0;

    // ── fan chart: step-level data from result.gbm ──
    const q50arr = r.gbm?.mean ?? [];
    const q05arr = r.gbm?.q05 ?? [];
    const q95arr = r.gbm?.q95 ?? [];

    const fanData = [
        // anchor t=0 at spot
        { t: 0, _base: s0, b_05_25: 0, b_25_50: 0, b_50_75: 0, b_75_95: 0, q50: s0, q05: s0, q95: s0 },
        ...q50arr.map((q50, i) => {
            const q05 = q05arr[i] ?? q50;
            const q95 = q95arr[i] ?? q50;
            const q25 = (q05 + q50) / 2;
            const q75 = (q50 + q95) / 2;
            return {
                t: i + 1,
                _base: q05,
                b_05_25: q25 - q05,
                b_25_50: q50 - q25,
                b_50_75: q75 - q50,
                b_75_95: q95 - q75,
                q50,
                q05,
                q95,
            };
        }),
    ];

    // ── sample paths (trajectories) for individual path overlay ──
    const samplePaths = (r.trajectories?.sample_paths ?? []).slice(0, 20);

    // ── VaR: sparse over chosen horizons ──
    const varData = (r.dynamic_var?.horizons ?? []).map((h, i) => ({
        horizon: `${h}d`,
        horizonDays: h,
        var95: ((r.dynamic_var.var?.[i] ?? 0) * 100),
        cvar95: ((r.dynamic_var.cvar?.[i] ?? 0) * 100),
    }));

    // ── predictive distribution at sparse horizons (for the scatter fan) ──
    const predDist = r.predictive_distribution ?? null;

    // ── PF weights snapshot ──
    const pf = r.particle_filter ?? {};

    // ── risk scenarios ──
    const scenarios = r.risk_scenarios ?? {};

    // ── support violation ──
    const supportViolation = r.support_violation ?? { levels: [], probabilities: [], horizons: [] };

    return {
        s0,
        horizon: r.meta?.forecast_horizon ?? q50arr.length,
        nObs: r.meta?.n_observations ?? 0,
        nPaths: r.meta?.n_paths ?? 0,
        fanData,
        samplePaths,
        varData,
        predDist,
        pf,
        scenarios,
        supportViolation,
        currency: payload.currency ?? "",
        tickerUpper: payload.ticker ?? "",
    };
}

/**
 * Adapts the local mock's format into the same internal contract so the
 * render layer doesn't branch on data source.
 */
function adaptMockResponse(fc) {
    const last = fc.ensemble[fc.ensemble.length - 1];
    return {
        s0: fc.s0,
        horizon: fc.horizon,
        nObs: 504,
        nPaths: fc.particle_filter.n_particles * 4,
        fanData: fc.ensemble.map((c) => ({
            t: c.t,
            _base: c.q05,
            b_05_25: c.q25 - c.q05,
            b_25_50: c.q50 - c.q25,
            b_50_75: c.q75 - c.q50,
            b_75_95: c.q95 - c.q75,
            q50: c.q50,
            q05: c.q05,
            q95: c.q95,
        })),
        samplePaths: [],
        varData: fc.dynamicVar.map((d) => ({
            horizon: d.horizon,
            horizonDays: d.t,
            var95: d.var95,
            cvar95: d.cvar95,
        })),
        predDist: null,
        pf: {
            model_weights: fc.particle_filter.model_weights,
            effective_sample_size: fc.particle_filter.effective_sample_size,
        },
        scenarios: {},
        supportViolation: { levels: [], probabilities: [], horizons: [] },
        currency: "EUR",
        tickerUpper: "MOCK",
    };
}

// ─── loading skeleton ────────────────────────────────────────────────────────

const SkeletonPage = () => (
    <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 w-full bg-[#0E1422] animate-pulse" />
            ))}
        </div>
        <div className="h-96 w-full bg-[#0E1422] animate-pulse" />
        <div className="grid grid-cols-2 gap-6">
            <div className="h-72 w-full bg-[#0E1422] animate-pulse" />
            <div className="h-72 w-full bg-[#0E1422] animate-pulse" />
        </div>
    </div>
);

// ─── heatmap colour for support violation ────────────────────────────────────
function violationColor(p) {
    const t = Math.max(0, Math.min(1, p ?? 0));
    return `rgba(255,77,94,${0.08 + t * 0.7})`;
}

// ─── main component ──────────────────────────────────────────────────────────

const EnsembleSdeForecastPage = () => {
    const { horizon: regime, profile: horizonProfile, rangeToken } = useHorizon();
    const { symbol: ticker } = useTicker();
    const [period, setPeriod] = useState("2y");
    const [horizon, setHorizon] = useState(() =>
        clampForecastHorizon(horizonProfile.steps),
    );

    // Sync forecast horizon when global regime / day-range changes (clamped to API limits).
    useEffect(() => {
        setHorizon(clampForecastHorizon(horizonProfile.steps));
    }, [regime, rangeToken, horizonProfile.steps]);

    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dataSource, setDataSource] = useState("live"); // "live" | "mock" | "error"
    const [warnings, setWarnings] = useState([]);
    const { demoMode } = useDemoMode();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setWarnings([]);
        try {
            const payload = await fetchEnsembleSdeForecast(ticker, period, {
                forecast_horizon: clampForecastHorizon(horizon),
                n_paths: 1000,
                n_particles: 300,
                rolling_window: 60,
            });
            setChartData(adaptApiResponse(payload));
            setWarnings(payload?.result?.meta?.warnings ?? payload?.result?.particle_filter?.warnings ?? []);
            setDataSource("live");
        } catch (err) {
            const msg = err?.response?.data?.detail ?? err?.message ?? "Backend unreachable";
            setError(msg);
            if (demoMode) {
                const { buildEnsembleForecast } = await import("../../dev/mock/quantMock");
                const mock = buildEnsembleForecast(86.0, horizon, regime);
                setChartData(adaptMockResponse(mock));
                setDataSource("mock");
            } else {
                setChartData(null);
                setDataSource("error");
            }
        } finally {
            setLoading(false);
        }
    }, [ticker, period, horizon, regime, demoMode]);

    useEffect(() => { load(); }, [load]);

    const chartKey = useMemo(
        () => `${ticker}-${period}-${horizon}-${regime}-${rangeToken}`,
        [ticker, period, horizon, regime, rangeToken],
    );
    const chartReady = useChartMountReady(!loading && chartData ? chartKey : null);

    const { fanData, varData, pf, scenarios, supportViolation, s0, nObs, nPaths, currency, samplePaths } =
        chartData ?? {};

    const lastFan = fanData?.[fanData.length - 1];
    const lastVar = varData?.[varData.length - 1];

    // Overlay: a few sample paths rendered as individual lines
    const pathOverlayData = useMemo(() => {
        if (!samplePaths?.length || !fanData?.length) return [];
        return fanData.map((row, i) => {
            const out = { t: row.t };
            samplePaths.slice(0, 8).forEach((path, k) => {
                out[`path_${k}`] = path[i] ?? null;
            });
            return out;
        });
    }, [samplePaths, fanData]);

    const dataSourceBadge = <DataSourceBadge source={dataSource} />;

    return (
        <div data-testid="sde-forecast-page">
            <PageHeader
                kicker="Operational · Stochastic Forecast"
                title="Ensemble SDE"
                accent="Forecast"
                description="GBM · Mean-Reverting OU · Jump-Diffusion con calibrazione rolling e particle filtering. Fan chart delle traiettorie simulate con fasce di confidenza 5/25/75/95 e VaR dinamico."
                actions={
                    <div className="flex items-center gap-2">
                        <AnalystGuidePanel model="sde" compact />
                        {chartData && dataSourceBadge}
                        <button
                            onClick={load}
                            disabled={loading}
                            title="Ricalcola"
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] border border-[#1B2335] text-slate-400 hover:border-[#2A3550] hover:text-white transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                            {loading ? "Computing…" : "Refresh"}
                        </button>
                    </div>
                }
            />

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-3 mb-6 p-4 border border-[#1B2335] bg-[#0A0F1C]">
                <ControlGroup label="Ticker">
                    <div className="px-3 py-1.5 text-[12px] font-mono text-[#00E5C0] border border-[#1B2335] bg-[#070B14]">
                        {ticker}
                        <span className="block text-[9px] text-slate-600 mt-0.5 normal-case tracking-normal">
                            Usa il selettore globale in alto
                        </span>
                    </div>
                </ControlGroup>

                <ControlGroup label="Period">
                    <div className="flex border border-[#1B2335]">
                        {PERIOD_OPTIONS.map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] ${period === p ? "bg-[#00E5C0] text-black" : "text-slate-500 hover:text-white"}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </ControlGroup>

                <ControlGroup label="Forecast horizon">
                    <div className="flex border border-[#1B2335]">
                        {HORIZON_OPTIONS.map((h) => (
                            <button
                                key={h}
                                onClick={() => setHorizon(clampForecastHorizon(h))}
                                className={`px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] ${horizon === h ? "bg-[#00E5C0] text-black" : "text-slate-500 hover:text-white"}`}
                            >
                                {h}d
                            </button>
                        ))}
                    </div>
                </ControlGroup>

                {error && (
                    <div className="ml-auto text-[10px] font-mono text-[#FF4D5E] flex items-center gap-2 border border-[#FF4D5E]/30 px-3 py-1.5 max-w-md">
                        {error}
                        {!demoMode && " — enable Demo Mode for synthetic fallback"}
                    </div>
                )}
            </div>

            {warnings.length > 0 && (
                <div className="mb-4 px-4 py-3 border border-[#FFB020]/40 bg-[#FFB020]/[0.06] text-[11px] font-mono text-[#FFB020]">
                    {warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
            )}

            {loading && !chartData ? <SkeletonPage /> : null}

            {!loading && !chartData && (
                <div className="px-4 py-8 border border-[#1B2335] bg-[#0A0F1C] text-center">
                    <p className="text-[11px] font-mono text-slate-500">
                        Nessun dato disponibile. Premi Refresh o cambia ticker.
                    </p>
                </div>
            )}

            {chartData && (
                <>
                    {/* KPI row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <StatTile
                            label="Spot S₀"
                            value={s0?.toFixed(2) ?? "—"}
                            sub={`${currency}  ·  ${nObs} obs  ·  ${nPaths} paths`}
                            tone="accent"
                        />
                        <StatTile
                            label={`Median q50 · T+${horizon}d`}
                            value={lastFan?.q50?.toFixed(2) ?? "—"}
                            sub={lastFan && s0 ? `${(((lastFan.q50 - s0) / s0) * 100).toFixed(2)}% drift` : ""}
                        />
                        <StatTile
                            label="90% cone"
                            value={lastFan ? `${lastFan.q05.toFixed(1)}–${lastFan.q95.toFixed(1)}` : "—"}
                            sub="q05 – q95 at horizon"
                            tone="info"
                        />
                        <StatTile
                            label="VaR 95% (max horizon)"
                            value={lastVar ? `${lastVar.var95.toFixed(2)}%` : "—"}
                            sub={lastVar ? `CVaR ${lastVar.cvar95.toFixed(2)}%` : ""}
                            tone="warning"
                        />
                    </div>

                    {/* Risk scenarios */}
                    {(scenarios?.bear || scenarios?.base || scenarios?.bull) && (
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <ScenarioCard label="Bear (q05)" s={scenarios.bear} currency={currency} tone="danger" />
                            <ScenarioCard label="Base (median)" s={scenarios.base} currency={currency} tone="neutral" />
                            <ScenarioCard label="Bull (q95)" s={scenarios.bull} currency={currency} tone="accent" />
                        </div>
                    )}

                    {!chartReady && (
                        <div className="h-96 w-full bg-[#0E1422] animate-pulse mb-6" />
                    )}

                    {chartReady && <SafeChart ready={chartReady} resetKey={chartKey} minHeight={440}>
                    <Panel
                        title="Forecast Fan / Cone"
                        subtitle={`Quantile bands 5 · ~25 · ~75 · 95 of the simulated ensemble  ·  T+${horizon}d`}
                        badge={dataSourceBadge}
                        testId="fan-chart"
                    >
                        <div style={{ height: 440 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={fanData}
                                    margin={{ top: 10, right: 24, bottom: 24, left: 0 }}
                                    stackOffset="none"
                                >
                                    <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="t"
                                        {...axisCommon}
                                        label={{ value: "forecast horizon (days)", position: "insideBottom", offset: -10, fill: "#64748B", fontSize: 10 }}
                                    />
                                    <YAxis {...axisCommon} domain={["auto", "auto"]} width={52} />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        formatter={(v, name) => [typeof v === "number" ? v.toFixed(2) : v, name]}
                                        labelFormatter={(l) => `t = ${l}d`}
                                    />

                                    {/* Stacked fan bands */}
                                    <Area dataKey="_base" stackId="fan" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
                                    <Area dataKey="b_05_25" stackId="fan" name="5–25%" stroke="none" fill={PALETTE.accent} fillOpacity={0.07} isAnimationActive={false} />
                                    <Area dataKey="b_25_50" stackId="fan" name="~25–50%" stroke="none" fill={PALETTE.accent} fillOpacity={0.16} isAnimationActive={false} />
                                    <Area dataKey="b_50_75" stackId="fan" name="~50–75%" stroke="none" fill={PALETTE.accent} fillOpacity={0.16} isAnimationActive={false} />
                                    <Area dataKey="b_75_95" stackId="fan" name="75–95%" stroke="none" fill={PALETTE.accent} fillOpacity={0.07} isAnimationActive={false} />

                                    {/* Individual sample paths (live only) */}
                                    {pathOverlayData.length > 0 && samplePaths.slice(0, 8).map((_, k) => (
                                        <Line
                                            key={`path_${k}`}
                                            data={pathOverlayData}
                                            dataKey={`path_${k}`}
                                            stroke={PALETTE.accent}
                                            strokeWidth={0.5}
                                            strokeOpacity={0.2}
                                            dot={false}
                                            isAnimationActive={false}
                                            legendType="none"
                                        />
                                    ))}

                                    {/* Median line */}
                                    <Line type="monotone" dataKey="q50" name="median q50" stroke={PALETTE.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                                    {/* Bound lines */}
                                    <Line type="monotone" dataKey="q05" name="q05" stroke={PALETTE.accent} strokeWidth={1} strokeOpacity={0.45} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                                    <Line type="monotone" dataKey="q95" name="q95" stroke={PALETTE.accent} strokeWidth={1} strokeOpacity={0.45} strokeDasharray="3 3" dot={false} isAnimationActive={false} />

                                    {/* S0 reference */}
                                    <ReferenceLine y={s0} stroke="#2A3550" strokeDasharray="5 4" label={{ value: `S₀ ${s0?.toFixed(2)}`, position: "insideTopRight", fill: "#64748B", fontSize: 10 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-5">
                            <Legend
                                items={[
                                    { label: "5–95% outer band", color: "rgba(0,229,192,0.10)" },
                                    { label: "~25–75% inner band", color: "rgba(0,229,192,0.32)" },
                                    { label: "median q50", color: PALETTE.accent },
                                    ...(pathOverlayData.length ? [{ label: "sample paths", color: "rgba(0,229,192,0.35)" }] : []),
                                ]}
                            />
                            {dataSource === "mock" && (
                                <span className="ml-auto text-[9px] font-mono text-[#FFB020] tracking-[0.15em]">
                                    q25/q75 = linear interpolation (mock)
                                </span>
                            )}
                            {dataSource === "live" && (
                                <span className="ml-auto text-[9px] font-mono text-slate-600 tracking-[0.15em]">
                                    ~q25 ≈ (q05+q50)/2 · ~q75 ≈ (q50+q95)/2
                                </span>
                            )}
                        </div>
                    </Panel>
                    </SafeChart>}

                    {chartReady && <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
                        {/* Dynamic VaR */}
                        <SafeChart ready={chartReady} resetKey={`${chartKey}-var`} minHeight={280}>
                        <Panel
                            title="Dynamic VaR / CVaR"
                            subtitle={`α = ${(pf?.alpha ?? 0.05) * 100 || 5}%  ·  L_T = (S₀ − S_T) / S₀  ·  empirical quantiles on ensemble`}
                            testId="dynamic-var"
                        >
                            <div style={{ height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={varData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                        <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                                        <XAxis dataKey="horizon" {...axisCommon} minTickGap={20} />
                                        <YAxis
                                            {...axisCommon}
                                            tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                                            domain={[0, "auto"]}
                                        />
                                        <Tooltip
                                            contentStyle={tooltipStyle}
                                            formatter={(v) => `${Number(v).toFixed(2)}%`}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="cvar95"
                                            name="CVaR 95%"
                                            stroke={PALETTE.danger}
                                            fill={PALETTE.danger}
                                            fillOpacity={0.07}
                                            strokeWidth={1.5}
                                            dot={{ r: 3, fill: PALETTE.danger }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="var95"
                                            name="VaR 95%"
                                            stroke={PALETTE.warn}
                                            strokeWidth={2}
                                            dot={{ r: 4, fill: PALETTE.warn }}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="mt-2 text-[10px] font-mono text-slate-600 leading-relaxed">
                                Perdita relativa L<sub>T</sub> = (S₀ − S<sub>T</sub>) / S₀ — quantili empirici sull'ensemble.
                            </p>
                        </Panel>
                        </SafeChart>

                        {/* Particle filter snapshot */}
                        <SafeChart ready={chartReady} resetKey={`${chartKey}-pf`} minHeight={280}>
                        <Panel
                            title="Particle Filter · Model Weights"
                            subtitle={`ESS ${pf?.effective_sample_size?.toFixed ? pf.effective_sample_size.toFixed(0) : "—"}  ·  snapshot al termine del rolling window`}
                            testId="pf-weights"
                        >
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                {["gbm", "ou", "jump"].map((m, i) => {
                                    const c = [PALETTE.accent, PALETTE.blue, PALETTE.purple][i];
                                    const lbl = ["GBM", "OU", "Jump"][i];
                                    const w = pf?.model_weights?.[m] ?? 0;
                                    return (
                                        <div key={m} className="border border-[#1B2335] bg-[#0A0F1C] p-4 text-center">
                                            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1">{lbl}</div>
                                            <div className="text-xl font-mono" style={{ color: c }}>{(w * 100).toFixed(0)}%</div>
                                            <div className="mt-2 h-1.5 bg-[#1B2335]">
                                                <div className="h-full" style={{ width: `${w * 100}%`, background: c }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Predictive distribution scatter at sparse horizons */}
                            {chartData?.predDist?.horizons?.length > 0 ? (
                                <PredDistScatter predDist={chartData.predDist} s0={s0} />
                            ) : (
                                <div className="text-[11px] font-mono text-slate-600 text-center py-6 border border-[#1B2335]">
                                    Predictive distribution — no sparse-horizon data
                                </div>
                            )}
                        </Panel>
                        </SafeChart>
                    </div>}

                    {dataSource === "live" && (
                        <BacktestSummaryPanel ticker={ticker} model="ensemble_sde" modelLabel="SDE" />
                    )}

                    {/* Support violation heatmap (live only, only if levels exist) */}
                    {chartReady && supportViolation?.levels?.length > 0 && (
                        <Panel
                            title="Support Violation Probability"
                            subtitle="P(min_{τ≤T} S_τ < S_k)  ·  from ensemble paths"
                            className="mt-6"
                            testId="support-violation"
                        >
                            <SupportViolationTable sv={supportViolation} currency={currency} />
                        </Panel>
                    )}
                </>
            )}
        </div>
    );
};

// ─── sub-components ──────────────────────────────────────────────────────────

const ControlGroup = ({ label, children }) => (
    <label className="block">
        <span className="block text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">
            {label}
        </span>
        {children}
    </label>
);

const ScenarioCard = ({ label, s, currency, tone }) => {
    const c = tone === "danger" ? PALETTE.danger : tone === "accent" ? PALETTE.accent : "#94A3B8";
    return (
        <div className="border border-[#1B2335] bg-[#0A0F1C] px-4 py-3">
            <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-mono" style={{ color: c }}>
                {s?.price != null ? Number(s.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                {currency && <span className="text-slate-600 ml-1 text-[10px]">{currency}</span>}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                {s?.return != null ? `${(s.return * 100).toFixed(2)}%  @  T+${s.horizon}d` : "—"}
            </div>
        </div>
    );
};

/**
 * Scatter plot of the predictive distribution quantiles at sparse horizons.
 * Each column = one horizon; we show q05/q50/q95 as three vertical dots.
 */
const PredDistScatter = ({ predDist, s0 }) => {
    const { horizons, quantiles } = predDist ?? {};
    if (!horizons?.length) return null;

    const scatterData = horizons.flatMap((h, i) => [
        { t: h, q: "q05", price: quantiles?.q05?.[i] ?? null },
        { t: h, q: "q50", price: quantiles?.q50?.[i] ?? null },
        { t: h, q: "q95", price: quantiles?.q95?.[i] ?? null },
    ]).filter((d) => d.price != null);

    return (
        <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="t" name="horizon" {...axisCommon} domain={[0, "auto"]} tickFormatter={(v) => `${v}d`} />
                    <YAxis type="number" dataKey="price" name="price" {...axisCommon} domain={["auto", "auto"]} width={48} />
                    <ZAxis range={[30, 30]} />
                    <ReferenceLine y={s0} stroke="#2A3550" strokeDasharray="4 4" />
                    <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ strokeDasharray: "3 3", stroke: "#2A3550" }}
                        formatter={(v, name) => [Number(v).toFixed(2), name]}
                    />
                    <Scatter data={scatterData.filter((d) => d.q === "q50")} name="q50" fill={PALETTE.accent} />
                    <Scatter data={scatterData.filter((d) => d.q === "q05")} name="q05" fill={PALETTE.danger} />
                    <Scatter data={scatterData.filter((d) => d.q === "q95")} name="q95" fill={PALETTE.blue} />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};

const SupportViolationTable = ({ sv, currency }) => {
    const { levels, probabilities, horizons } = sv;
    return (
        <div className="overflow-x-auto">
            <table className="w-full font-mono text-[11px]">
                <thead className="text-slate-500 text-[10px] uppercase tracking-[0.2em]">
                    <tr>
                        <th className="text-right pb-3 pr-4 font-normal">Support S_k</th>
                        {horizons.map((h) => (
                            <th key={h} className="text-center pb-3 px-2 font-normal">{h}d</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {levels.map((lvl, k) => {
                        const row = probabilities[k] ?? [];
                        return (
                            <tr key={k} className="border-t border-[#1B2335] hover:bg-white/[0.02]">
                                <td className="py-2 pr-4 text-right text-[#00E5C0]">
                                    {Number(lvl).toFixed(2)}
                                    {currency && <span className="text-slate-600 ml-1 text-[9px]">{currency}</span>}
                                </td>
                                {row.map((p, j) => (
                                    <td
                                        key={j}
                                        className="text-center py-2 px-2"
                                        style={{ background: violationColor(p) }}
                                        title={`P(violation) = ${(p * 100).toFixed(1)}%`}
                                    >
                                        <span className="text-white/90">{(p * 100).toFixed(0)}%</span>
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default EnsembleSdeForecastPage;
