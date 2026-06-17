/**
 * SheafCohomologyPage.jsx — Model 10
 * ────────────────────────────────────────────────────────────────────────────
 * Sheaf Cohomology on Financial Topologies (Čech cohomology).
 *
 * DATA FLOW
 *   1. Mount / horizon change → fetchSheafCohomology(ticker, { days, horizon })
 *   2. Auto-refresh every 60s for live obstruction updates
 *   3. Error → show message (no mock fallback — user requested real data only)
 *
 * BACKEND CONTRACT  (GET /api/sheaf/cohomology)
 *   result.nodes, result.edges, result.cocycles, result.series, result.metrics, result.meta
 */

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from "recharts";
import { RefreshCw, Info } from "lucide-react";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { SafeChart } from "../../components/quant/shared/ChartErrorBoundary";

import {
    PageHeader,
    Panel,
    StatTile,
    StatusBadge,
    Gauge,
    PALETTE,
} from "../../components/quant/shared/primitives";
import { axisCommon, tooltipStyle, gridStroke } from "../../components/quant/shared/chartTheme";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { tickerAccent } from "../../lib/tickers";
import { fetchSheafCohomology } from "../../lib/api";
import BacktestSummaryPanel from "../../components/quant/BacktestSummaryPanel";

/** Obstruction → colour (teal = exact/glued, red = obstructed). */
const obsColor = (mag) => {
    const t = Math.min(1, Math.abs(mag) / 1.2);
    return `rgba(255,77,94,${0.15 + t * 0.75})`;
};

/** SVG nerve graph: nodes = open sets Uᵢ, edges = overlaps Uᵢ∩Uⱼ. */
const NerveGraph = ({ data, accent }) => {
    if (!data?.nodes?.length) {
        return (
            <div className="text-[11px] font-mono text-slate-600 py-8 text-center">
                Nessun dato nervo disponibile
            </div>
        );
    }

    const S = 360;
    const pad = 52;
    const R = (S - 2 * pad) / 2;
    const cx = S / 2;
    const cy = S / 2;
    const map = (p) => ({ x: cx + p.x * R, y: cy + p.y * R });
    const pts = data.nodes.map(map);

    return (
        <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-auto" data-testid="nerve-graph">
            {data.edges.map((e, idx) => {
                const holonomy = Math.abs(e.obstruction ?? 0);
                const friction = Math.abs(e._residual ?? 0);
                const mag = Math.max(holonomy, friction);
                const obstructed = mag > 0.02;
                return (
                    <line
                        key={`e-${idx}`}
                        x1={pts[e.i].x}
                        y1={pts[e.i].y}
                        x2={pts[e.j].x}
                        y2={pts[e.j].y}
                        stroke={obstructed ? obsColor(mag) : `${accent}66`}
                        strokeWidth={obstructed ? 1.6 + Math.min(3, mag * 2) : 1}
                        strokeDasharray={obstructed ? "0" : "4 3"}
                    />
                );
            })}
            {pts.map((p, i) => {
                const node = data.nodes[i];
                const r = 9 + Math.min(8, Math.abs(node.section) * 1.6);
                return (
                    <g key={`n-${i}`}>
                        <circle cx={p.x} cy={p.y} r={r} fill={`${accent}1A`} stroke={accent} strokeWidth={1.4} />
                        <text x={p.x} y={p.y - r - 4} textAnchor="middle" fill="#CBD5E1" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9 }}>
                            {node.label}
                        </text>
                        <text x={p.x} y={p.y + 3} textAnchor="middle" fill="#94A3B8" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8 }}>
                            {node.section > 0 ? "+" : ""}{node.section}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const SheafCohomologyPage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { ticker } = useTicker();
    const accent = tickerAccent(ticker);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const chartKey = useMemo(
        () => `${horizon}-${rangeToken}-${ticker.symbol}-${profile.steps}`,
        [horizon, rangeToken, ticker.symbol, profile.steps],
    );
    const chartReady = useChartMountReady(!loading && data ? chartKey : null);

    const load = useCallback(async (silent = false) => {
        if (!silent) {
            setLoading(true);
            setData(null);
        }
        setError(null);
        try {
            const payload = await fetchSheafCohomology(ticker.symbol, {
                days: profile.steps,
                horizon,
                connectivity: ticker.connectivity,
            });
            setData(payload.result);
            setLastUpdate(new Date());
        } catch (err) {
            const msg = err?.response?.data?.detail ?? err?.message ?? "Backend non raggiungibile";
            setError(msg);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [ticker.symbol, ticker.connectivity, profile.steps, horizon]);

    useEffect(() => {
        load();
    }, [load, rangeToken]);

    // Auto-refresh ogni 60s per dati in tempo reale.
    useEffect(() => {
        const id = setInterval(() => load(true), 60_000);
        return () => clearInterval(id);
    }, [load]);

    const metrics = data?.metrics ?? {};
    const series = data?.series ?? [];
    const cocycles = data?.cocycles ?? [];
    const meta = data?.meta ?? {};

    return (
        <div data-testid="sheaf-cohomology-page">
            <PageHeader
                kicker="R&D · Čech Cohomology · Model 10"
                title={`Sheaf Cohomology · ${ticker.symbol}`}
                accent="H¹(𝒳,ℱ)"
                description={`Sezioni locali di un fascio di dati di mercato ℱ su un ricoprimento 𝒳 = ⋃ Uᵢ di sotto-regimi di ${ticker.name}. H¹ misura l'indice di ostruzione informativa (arbitraggio).`}
                actions={
                    <div className="flex items-center gap-2">
                        <StatusBadge status="rnd" />
                        <button
                            type="button"
                            onClick={() => load()}
                            disabled={loading}
                            title="Aggiorna dati live"
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] border border-[#1B2335] text-slate-400 hover:border-[#2A3550] hover:text-white transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                            {loading ? "Loading…" : "Refresh"}
                        </button>
                        <DataSourceBadge source={error ? "error" : "live"} />
                        <AnalystGuidePanel model="sheaf" />
                    </div>
                }
            />

            {error && (
                <div className="mb-6 px-4 py-3 border border-[#FF4D5E]/40 bg-[#FF4D5E]/[0.06] text-[11px] font-mono text-[#FF9AA5]">
                    Errore nel caricamento dati live: {error}
                </div>
            )}

            {!error && data?.error && (
                <div className="mb-6 px-4 py-3 border border-amber-500/40 bg-amber-500/[0.06] text-[11px] font-mono text-amber-200/90">
                    {data.error}
                </div>
            )}

            {!error && data && !data?.error && (
                <div className="mb-6 px-4 py-3 border border-[#00E5C0]/30 bg-[#00E5C0]/[0.05] text-[11px] font-mono text-[#00E5C0]/90 leading-relaxed">
                    Dati live da Yahoo Finance — peer basket: {(meta.peers_used || []).join(", ")} ·
                    finestra {meta.days} gg · {meta.n_observations} osservazioni
                    {lastUpdate ? ` · aggiornato ${lastUpdate.toLocaleTimeString()}` : ""}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile
                    label="dim H¹"
                    value={loading ? "…" : metrics.h1_dim ?? "—"}
                    sub="classi di ostruzione"
                    tone={metrics.h1_dim > 0 ? "warning" : "accent"}
                />
                <StatTile
                    label="Cross-Asset Residual Signal"
                    value={loading ? "…" : `${((metrics.obstruction_index ?? 0) * 100).toFixed(0)}%`}
                    sub={
                        <span className="inline-flex items-center gap-1">
                            {metrics.arbitrage ? "signal elevated (experimental)" : "within peer band"}
                            <span
                                className="inline-flex"
                                title="This signal compares peer ETF return residuals. It is a heuristic, not a verified arbitrage. Use for hypothesis generation only."
                            >
                                <Info size={11} className="text-slate-500" />
                            </span>
                        </span>
                    }
                    tone={metrics.arbitrage ? "warning" : "accent"}
                />
                <StatTile label="dim H⁰" value={loading ? "…" : metrics.h0_dim ?? "—"} sub="sezioni globali" tone="info" />
                <StatTile
                    label="Overlaps · χ"
                    value={loading ? "…" : `${metrics.n_overlaps ?? "—"} · ${metrics.euler_char ?? "—"}`}
                    sub="Uᵢ∩Uⱼ · Eulero"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Panel
                    title="Nerve of the Cover 𝒳 = ⋃ Uᵢ"
                    subtitle="nodi = sotto-regimi · archi rossi = ostruzione (1-cociclo)"
                    className="xl:col-span-2"
                    testId="sheaf-nerve"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        {chartReady && data ? (
                            <NerveGraph key={chartKey} data={data} accent={accent} />
                        ) : (
                            <div className="col-span-1 h-48 bg-[#0E1422] animate-pulse" />
                        )}
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                                Cocicli · olonomia su cicli indipendenti
                            </div>
                            <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                                {!loading && cocycles.length === 0 ? (
                                    <div className="text-[11px] font-mono text-[#00E5C0] border border-[#00E5C0]/30 bg-[#00E5C0]/[0.05] px-3 py-2">
                                        H¹ = 0 — tutte le sezioni si incollano (mercato efficiente)
                                    </div>
                                ) : (
                                    cocycles.map((c, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-[11px] font-mono border border-[#1B2335] px-3 py-1.5">
                                            <span className="text-slate-400">
                                                {data?.nodes?.[c.i]?.label} ⟲ {data?.nodes?.[c.j]?.label}
                                            </span>
                                            <span style={{ color: Math.abs(c.holonomy) > 0.45 ? PALETTE.danger : PALETTE.warn }}>
                                                {c.holonomy > 0 ? "+" : ""}{c.holonomy}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </Panel>

                <Panel title="Obstruction Magnitude" subtitle="‖H¹‖ — inefficienza informativa" testId="sheaf-magnitude">
                    <div className="flex flex-col items-center mb-3">
                        {chartReady ? (
                            <Gauge key={`gauge-${chartKey}`} value={metrics.obstruction_index ?? 0} label="H¹ magnitude" />
                        ) : (
                            <div className="w-32 h-32 bg-[#0E1422] animate-pulse rounded-full" />
                        )}
                    </div>
                    <div style={{ height: 150 }}>
                        {chartReady && series.length > 0 ? (
                            <ResponsiveContainer key={`chart-${chartKey}`} width="100%" height="100%">
                                <AreaChart data={series} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
                                    <defs>
                                        <linearGradient id="obsGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={PALETTE.danger} stopOpacity={0.5} />
                                            <stop offset="100%" stopColor={PALETTE.danger} stopOpacity={0.03} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                                    <XAxis dataKey="t" {...axisCommon} tickFormatter={(v) => `${v}`} />
                                    <YAxis {...axisCommon} width={36} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => Number(v).toFixed(3)} labelFormatter={(l) => `t = ${l}`} />
                                    <ReferenceLine y={0.55} stroke="#FFB020" strokeDasharray="4 4" />
                                    <Area type="monotone" dataKey="mag" name="‖H¹‖" stroke={PALETTE.danger} strokeWidth={1.6} fill="url(#obsGrad)" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full bg-[#0E1422] animate-pulse" />
                        )}
                    </div>
                    <p className="mt-2 text-[10px] font-mono text-slate-600 leading-relaxed">
                        Soglia 0.55 (linea ambra) = livello oltre cui l'ostruzione segnala arbitraggio sfruttabile.
                    </p>
                </Panel>
            </div>

            <BacktestSummaryPanel ticker={ticker} model="sheaf" modelLabel="Sheaf" />
        </div>
    );
};

export default SheafCohomologyPage;
