import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    BrainCircuit,
    Activity,
    Network,
    Sigma,
    AlertTriangle,
    Zap,
    GitBranch,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";

import {
    fetchMarketData,
    fetchTdaFnn,
    fetchTdaMapper,
    fetchTdaFull,
    fetchEnsembleSdeForecast,
} from "../../lib/api";
import {
    buildMockFnn,
    buildMockMapper,
    buildMockTdaFull,
} from "../../lib/tdaMock";

import FnnCharts from "./tda/FnnCharts";
import MapperGraph from "./tda/MapperGraph";
import GbmFanChart from "./tda/GbmFanChart";
import EnsembleSdeRiskPanel from "./tda/EnsembleSdeRiskPanel";
import InterpretationCard from "./tda/InterpretationCard";
import TopologicalSkeleton from "./tda/TopologicalSkeleton";

/**
 * Topological Analysis View
 *
 * Layout:
 *   - Header with mode toggle (Trader ↔ Quant)
 *   - Panel A: FNN & Delay Embedding  (Math view)
 *   - Panel B: Market Mapper          (Math view)
 *   - Panel C: Regimes + GBM cone     (always)
 */
const TopologicalAnalysisView = ({ ticker = "AAPL", period = "1y" }) => {
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState("Bootstrapping pipeline");
    const [fnn, setFnn] = useState(null);
    const [mapper, setMapper] = useState(null);
    const [tda, setTda] = useState(null);
    const [market, setMarket] = useState(null);
    const [ensembleSde, setEnsembleSde] = useState(null);
    const [usingMock, setUsingMock] = useState(false);
    const [ensembleFallback, setEnsembleFallback] = useState(false);
    const [errors, setErrors] = useState([]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setUsingMock(false);
            setErrors([]);
            const errs = [];

            // Always pull market data first (used as price backbone for Panel C)
            let market = null;
            try {
                setStage("Fetching historical price series");
                market = await fetchMarketData(ticker, period);
                if (!cancelled) setMarket(market);
            } catch (e) {
                errs.push(`market: ${e?.response?.data?.detail || e.message}`);
            }

            // Ensemble SDE forecast (live endpoint — feeds fan chart + risk panel)
            try {
                setStage("Running ensemble SDE forecast (GBM + OU + Jump PF)");
                const res = await fetchEnsembleSdeForecast(ticker, period, {
                    forecast_horizon: 20,
                    n_paths: 1500,
                    n_particles: 300,
                });
                if (!cancelled) {
                    setEnsembleSde(res);
                    setEnsembleFallback(false);
                }
            } catch (e) {
                errs.push(`ensemble-sde: ${e?.response?.data?.detail || e.message}`);
                if (!cancelled) {
                    setEnsembleSde(null);
                    setEnsembleFallback(true);
                }
            }

            // FNN
            try {
                setStage("Estimating embedding dimension (FNN / Cao)");
                const res = await fetchTdaFnn(ticker, period, { d_max: 10 });
                if (!cancelled) setFnn(res);
            } catch (e) {
                errs.push(`fnn: ${e?.response?.data?.detail || e.message}`);
                if (!cancelled) setFnn(buildMockFnn());
            }

            // Mapper
            try {
                setStage("Building Mapper simplicial complex");
                const res = await fetchTdaMapper(ticker, period);
                if (!cancelled) setMapper(res);
            } catch (e) {
                errs.push(`mapper: ${e?.response?.data?.detail || e.message}`);
                if (!cancelled) setMapper(buildMockMapper());
            }

            // Full TDA
            try {
                setStage("Computing persistent homology & regimes");
                const res = await fetchTdaFull(ticker, period);
                if (!cancelled) setTda(res);
            } catch (e) {
                errs.push(`tda: ${e?.response?.data?.detail || e.message}`);
                if (!cancelled) setTda(buildMockTdaFull(market?.series || []));
            }

            if (!cancelled) {
                if (errs.length > 0) {
                    setUsingMock(true);
                    setErrors(errs);
                    toast.warning(
                        `Backend unreachable on ${errs.length} TDA endpoint(s) — showing mock state.`
                    );
                }
                setLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [ticker, period]);

    // Price backbone from market data; regime overlay from TDA when available
    const topologySeries = useMemo(() => {
        const series = market?.series || [];
        const regimes = tda?.data?.topology_series || [];
        if (series.length === 0 && regimes.length > 0) return regimes;
        return series.map((p, i) => ({
            t: i,
            date: p.date,
            price: p.close,
            regime: regimes[i]?.regime ?? false,
        }));
    }, [market, tda]);

    // Forecast cone: prefer live ensemble SDE, fallback to TDA/mock simulation
    const gbmForecast = useMemo(() => {
        if (ensembleSde?.result?.gbm?.mean?.length > 0) {
            return ensembleSde.result.gbm;
        }
        const sims = tda?.data?.simulations || {};
        const keys = Object.keys(sims);
        if (keys.length === 0) return null;
        const lastKey = keys[keys.length - 1];
        return sims[lastKey]?.paths_summary || null;
    }, [ensembleSde, tda]);

    const ensembleMeta = useMemo(() => ensembleSde?.result?.meta || {}, [ensembleSde]);

    const metaSummary = useMemo(() => {
        const m = tda?.data?.meta || {};
        return {
            n_timesteps: m.n_timesteps ?? 0,
            n_sparse: m.n_sparse ?? 0,
            tau_used: m.tau_used ?? "—",
        };
    }, [tda]);

    if (loading) {
        return (
            <div className="space-y-6" data-testid="tda-loading">
                <ToggleBar isAdvanced={isAdvanced} setIsAdvanced={setIsAdvanced} disabled />
                <TopologicalSkeleton stage={stage} />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="tda-view">
            <ToggleBar isAdvanced={isAdvanced} setIsAdvanced={setIsAdvanced} />

            {/* Mock banner */}
            {usingMock && (
                <div
                    className="flex items-start gap-3 border border-[#FF9F1C]/40 bg-[#FF9F1C]/5 px-4 py-3"
                    data-testid="tda-mock-banner"
                >
                    <AlertTriangle
                        size={14}
                        className="text-[#FF9F1C] mt-0.5 shrink-0"
                        strokeWidth={1.6}
                    />
                    <div className="text-[12px] font-mono text-[#FF9F1C] leading-relaxed">
                        <span className="uppercase tracking-[0.2em]">mock_mode ::</span>{" "}
                        Live TDA endpoints returned errors. Showing illustrative synthetic
                        data so the UI remains testable.
                        <div className="text-[10px] text-[#FF9F1C]/70 mt-1 font-normal">
                            {errors.slice(0, 3).map((e, i) => (
                                <div key={i}>• {e}</div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Topology summary strip */}
            <div
                className="grid grid-cols-2 md:grid-cols-4 gap-3"
                data-testid="tda-summary-strip"
            >
                <SummaryStat
                    icon={<Sigma size={12} strokeWidth={1.6} />}
                    label="window samples"
                    value={metaSummary.n_timesteps}
                />
                <SummaryStat
                    icon={<Zap size={12} strokeWidth={1.6} />}
                    label="sparse regimes"
                    value={metaSummary.n_sparse}
                    tone={metaSummary.n_sparse > 0 ? "warn" : "ok"}
                />
                <SummaryStat
                    icon={<GitBranch size={12} strokeWidth={1.6} />}
                    label="τ (delay)"
                    value={metaSummary.tau_used}
                />
                <SummaryStat
                    icon={<BrainCircuit size={12} strokeWidth={1.6} />}
                    label="d* recommended"
                    value={fnn?.data?.d_recommended ?? "—"}
                />
            </div>

            {ensembleFallback && (
                <div
                    className="flex items-start gap-3 border border-[#FF9F1C]/40 bg-[#FF9F1C]/5 px-4 py-3"
                    data-testid="ensemble-sde-fallback-banner"
                >
                    <AlertTriangle
                        size={14}
                        className="text-[#FF9F1C] mt-0.5 shrink-0"
                        strokeWidth={1.6}
                    />
                    <div className="text-[12px] font-mono text-[#FF9F1C] leading-relaxed">
                        <span className="uppercase tracking-[0.2em]">ensemble_sde ::</span>{" "}
                        Endpoint non disponibile — fan chart in fallback TDA/mock.
                    </div>
                </div>
            )}

            {/* PANEL C — always visible: regimes + ensemble SDE cone */}
            <Section
                title="Panel C — Topological Regimes & Ensemble SDE Forecast"
                subtitle="Price action with red overlays on sparse topological regimes. Forecast cone from ensemble SDE (GBM + OU + Jump-diffusion) with particle-filter weights — q05 / mean / q95."
                icon={<Activity size={13} strokeWidth={1.6} />}
                testId="tda-panel-c"
            >
                <GbmFanChart
                    topologySeries={topologySeries}
                    gbm={gbmForecast}
                    height={460}
                />
                <Legend
                    items={[
                        { color: "#FFFFFF", label: "Historical price" },
                        { color: "#00E5C0", label: "Ensemble mean (forecast)" },
                        { color: "rgba(0,229,192,0.35)", label: "q05 – q95 band", swatch: "band" },
                        { color: "rgba(255,59,48,0.5)", label: "Sparse regime (structural risk)", swatch: "band" },
                    ]}
                />
                {ensembleSde?.result && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-neutral-500">
                        <span>S₀ = {Number(ensembleMeta.s0).toFixed(2)}</span>
                        <span>paths = {ensembleMeta.n_paths}</span>
                        <span>horizon = {ensembleMeta.forecast_horizon}d</span>
                        <span>
                            PF weights: GBM{" "}
                            {((ensembleSde.result.particle_filter?.model_weights?.gbm || 0) * 100).toFixed(0)}%
                        </span>
                    </div>
                )}
            </Section>

            {/* PANEL D — support violation + dynamic VaR */}
            <Section
                title="Panel D — Support Violation & Dynamic VaR"
                subtitle="Heatmap P(min S < support) across horizons. VaR/CVaR curves from the simulated ensemble loss distribution."
                icon={<AlertTriangle size={13} strokeWidth={1.6} />}
                testId="tda-panel-d"
            >
                <EnsembleSdeRiskPanel
                    result={ensembleSde?.result}
                    currency={ensembleSde?.currency || market?.currency}
                />
            </Section>

            {/* ADVANCED ONLY */}
            {isAdvanced && (
                <>
                    {/* PANEL A — FNN */}
                    <Section
                        title="Panel A — FNN & Delay Embedding"
                        subtitle="Scientific validation of the embedding dimension. Kennel FNN should drop towards 0 while Cao's E* converges to 1."
                        icon={<Sigma size={13} strokeWidth={1.6} />}
                        testId="tda-panel-a"
                    >
                        <FnnCharts
                            chartFnn={fnn?.data?.chart_fnn || []}
                            chartCao={fnn?.data?.chart_cao || []}
                            dRecommended={fnn?.data?.d_recommended}
                        />
                        <div className="mt-4">
                            <InterpretationCard
                                title="Embedding interpretation"
                                text={fnn?.data?.summary?.interpretation}
                                warning={fnn?.data?.summary?.warning}
                            />
                        </div>
                    </Section>

                    {/* PANEL B — Mapper */}
                    <Section
                        title="Panel B — Market Mapper"
                        subtitle="Simplicial skeleton of the price manifold. Nodes are local clusters — color encodes local volatility. Hover to inspect, scroll to zoom, drag to pan."
                        icon={<Network size={13} strokeWidth={1.6} />}
                        testId="tda-panel-b"
                    >
                        <MapperGraph
                            graphData={mapper?.data?.graph}
                            colorRange={mapper?.data?.meta?.color_range || [0, 1]}
                            height={460}
                        />
                        <MapperMeta meta={mapper?.data?.meta} />
                    </Section>

                    {/* Topology metrics table */}
                    <Section
                        title="Topological invariants"
                        subtitle="Persistent homology indicators across the rolling windows."
                        icon={<BrainCircuit size={13} strokeWidth={1.6} />}
                        testId="tda-panel-invariants"
                    >
                        <BettiTable rows={topologySeries.slice(0, 8)} />
                    </Section>
                </>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ToggleBar = ({ isAdvanced, setIsAdvanced, disabled = false }) => (
    <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#222222] pb-5"
        data-testid="tda-toggle-bar"
    >
        <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                // Topological Data Analysis
            </div>
            <h2 className="text-2xl sm:text-3xl tracking-tight font-medium mt-2">
                Market structure via{" "}
                <span className="text-[#00E5C0]">persistent homology</span>
            </h2>
            <p className="text-[13px] text-neutral-400 mt-2 max-w-2xl">
                {isAdvanced
                    ? "Advanced view — Betti numbers β₀, β₁, persistent entropy E\u209C and the Mapper simplicial complex."
                    : "Trader view — actionable regime alerts, structural risk overlays and GBM probability cones."}
            </p>
        </div>
        <div className="flex items-center gap-3" data-testid="tda-mode-toggle">
            <span
                className={[
                    "text-[10px] font-mono uppercase tracking-[0.25em]",
                    !isAdvanced ? "text-[#00E5C0]" : "text-neutral-500",
                ].join(" ")}
            >
                Trader
            </span>
            <Switch
                checked={isAdvanced}
                onCheckedChange={setIsAdvanced}
                disabled={disabled}
                data-testid="tda-mode-switch"
                className="data-[state=checked]:bg-[#00E5C0] data-[state=unchecked]:bg-[#222222]"
            />
            <span
                className={[
                    "text-[10px] font-mono uppercase tracking-[0.25em]",
                    isAdvanced ? "text-[#00E5C0]" : "text-neutral-500",
                ].join(" ")}
            >
                Quant
            </span>
        </div>
    </div>
);

const Section = ({ title, subtitle, icon, children, testId }) => (
    <section
        className="border border-[#222222] bg-[#0F0F0F] p-5 sm:p-6"
        data-testid={testId}
    >
        <header className="mb-4 flex items-start justify-between gap-4">
            <div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-[#00E5C0]">
                    {icon}
                    <span>{title}</span>
                </div>
                {subtitle && (
                    <p className="text-[12px] text-neutral-400 mt-2 max-w-3xl leading-relaxed">
                        {subtitle}
                    </p>
                )}
            </div>
        </header>
        {children}
    </section>
);

const SummaryStat = ({ icon, label, value, tone = "neutral" }) => {
    const toneClass =
        tone === "warn"
            ? "text-[#FF9F1C]"
            : tone === "ok"
            ? "text-[#00E5C0]"
            : "text-white";
    return (
        <div className="border border-[#222222] bg-[#0F0F0F] p-3">
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                {icon}
                <span>{label}</span>
            </div>
            <div className={`mt-1.5 text-lg font-mono ${toneClass}`}>
                {value}
            </div>
        </div>
    );
};

const Legend = ({ items }) => (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 pt-3 border-t border-[#222222]">
        {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2">
                <span
                    className="inline-block"
                    style={{
                        width: it.swatch === "band" ? 18 : 12,
                        height: it.swatch === "band" ? 10 : 2,
                        backgroundColor: it.color,
                        borderRadius: it.swatch === "band" ? 2 : 0,
                    }}
                />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-400">
                    {it.label}
                </span>
            </div>
        ))}
    </div>
);

const MapperMeta = ({ meta }) => {
    if (!meta) return null;
    return (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-[11px] font-mono">
            <MetaCell label="nodes" value={meta.n_nodes} />
            <MetaCell label="edges" value={meta.n_edges} />
            <MetaCell label="filter" value={meta.filter} />
            <MetaCell label="d_used" value={meta.d_used} />
            <MetaCell label="τ_used" value={meta.tau_used} />
        </div>
    );
};

const MetaCell = ({ label, value }) => (
    <div className="border border-[#222222] bg-[#050505] px-3 py-2">
        <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">
            {label}
        </div>
        <div className="text-neutral-200 mt-0.5">{String(value ?? "—")}</div>
    </div>
);

const BettiTable = ({ rows = [] }) => {
    if (rows.length === 0) {
        return (
            <div className="text-[11px] font-mono text-neutral-500">
                No topology samples available.
            </div>
        );
    }
    return (
        <div className="overflow-x-auto border border-[#222222]">
            <table className="w-full text-[11px] font-mono">
                <thead className="bg-[#050505] text-neutral-500">
                    <tr>
                        {["t", "β₀", "β₁", "E_H0", "E_H1", "π_H0", "π_H1", "regime"].map(
                            (h) => (
                                <th
                                    key={h}
                                    className="px-3 py-2 text-left uppercase tracking-[0.2em]"
                                >
                                    {h}
                                </th>
                            )
                        )}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, idx) => (
                        <tr
                            key={idx}
                            className="border-t border-[#1a1a1a] hover:bg-[#050505]"
                        >
                            <td className="px-3 py-2 text-neutral-400">{r.t}</td>
                            <td className="px-3 py-2 text-white">{r.beta_0}</td>
                            <td className="px-3 py-2 text-white">{r.beta_1}</td>
                            <td className="px-3 py-2 text-neutral-300">
                                {fmt(r.E_H0)}
                            </td>
                            <td className="px-3 py-2 text-neutral-300">
                                {fmt(r.E_H1)}
                            </td>
                            <td className="px-3 py-2 text-neutral-300">
                                {fmt(r.Pi_H0)}
                            </td>
                            <td className="px-3 py-2 text-neutral-300">
                                {fmt(r.Pi_H1)}
                            </td>
                            <td className="px-3 py-2">
                                {r.regime ? (
                                    <span className="text-[#FF3B30]">SPARSE</span>
                                ) : (
                                    <span className="text-neutral-600">stable</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const fmt = (v) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(3);

export default TopologicalAnalysisView;
