/**
 * CliqueHomologyPage.jsx — Model 9
 * Live Vietoris–Rips persistent homology on peer correlation graph.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    Legend as RLegend,
} from "recharts";
import { RefreshCw } from "lucide-react";

import {
    PageHeader,
    Panel,
    StatTile,
    StatusBadge,
    Legend,
    PALETTE,
} from "../../components/quant/shared/primitives";
import { axisCommon, tooltipStyle, gridStroke } from "../../components/quant/shared/chartTheme";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { tickerAccent } from "../../lib/tickers";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { fetchTdaClique } from "../../lib/api";

const adaptCliqueResult = (result) => {
    const curve = result.beta0_series.map(([eps, beta0], i) => ({
        eps,
        beta0,
        beta1: result.beta1_series[i]?.[1] ?? 0,
    }));
    const b1births = curve.filter((c) => c.beta1 > 0);
    const nodes = (result.node_layout || []).map((pos, i) => ({
        id: i,
        label: result.node_labels[i],
        x: pos.x,
        y: pos.y,
    }));
    const edges = (result.clique_complex_edges || []).map(([i, j, w]) => ({ i, j, w }));
    const triangles = result.clique_complex_triangles || [];
    return {
        n: result.node_labels.length,
        nodes,
        edges,
        triangles,
        curve,
        epsStar: result.eps_star,
        error: result.error,
        degraded: result.degraded,
        metrics: {
            max_beta1: result.max_beta1,
            betti1_birth: b1births.length ? b1births[0].eps : null,
            betti1_death: b1births.length ? b1births[b1births.length - 1].eps : null,
            betti1_persistence:
                b1births.length > 0
                    ? Number((b1births[b1births.length - 1].eps - b1births[0].eps).toFixed(3))
                    : 0,
            edges_at_star: edges.length,
            triangles_at_star: triangles.length,
        },
        meta: { peers: result.peers, days_used: result.days_used, interpretation: result.interpretation },
    };
};

const CliqueGraph = ({ data, accent }) => {
    const S = 360;
    const pad = 46;
    const R = (S - 2 * pad) / 2;
    const cx = S / 2;
    const cy = S / 2;
    const map = (p) => ({ x: cx + p.x * R, y: cy + p.y * R });
    const pts = data.nodes.map(map);

    return (
        <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-auto" data-testid="clique-graph">
            {data.triangles.map((t, idx) => {
                const [a, b, c] = t;
                return (
                    <polygon
                        key={`tri-${idx}`}
                        points={`${pts[a].x},${pts[a].y} ${pts[b].x},${pts[b].y} ${pts[c].x},${pts[c].y}`}
                        fill={accent}
                        fillOpacity={0.06}
                        stroke="none"
                    />
                );
            })}
            {data.edges.map((e, idx) => (
                <line
                    key={`e-${idx}`}
                    x1={pts[e.i].x}
                    y1={pts[e.i].y}
                    x2={pts[e.j].x}
                    y2={pts[e.j].y}
                    stroke={accent}
                    strokeOpacity={0.18 + e.w * 0.5}
                    strokeWidth={0.6 + e.w * 1.6}
                />
            ))}
            {pts.map((p, i) => (
                <g key={`n-${i}`}>
                    <circle cx={p.x} cy={p.y} r={5.5} fill="#0A0F1C" stroke={accent} strokeWidth={1.4} />
                    <text
                        x={p.x + (p.x >= cx ? 9 : -9)}
                        y={p.y + 3}
                        textAnchor={p.x >= cx ? "start" : "end"}
                        fill="#94A3B8"
                        style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9 }}
                    >
                        {data.nodes[i].label}
                    </text>
                </g>
            ))}
        </svg>
    );
};

const CliqueHomologyPage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { ticker } = useTicker();
    const accent = tickerAccent(ticker);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const chartKey = `${ticker.symbol}-${horizon}-${rangeToken}`;
    const chartReady = useChartMountReady(!loading && data ? chartKey : null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchTdaClique(ticker.symbol, {
                days: Math.max(60, profile.steps),
                horizon,
                n_peers: Math.min(14, Math.max(8, ticker.nNodes || 10)),
            });
            setData(adaptCliqueResult(payload.result));
        } catch (err) {
            const msg = err?.response?.data?.detail ?? err?.message ?? "Backend non raggiungibile";
            setError(msg);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [ticker.symbol, ticker.nNodes, profile.steps, horizon]);

    useEffect(() => {
        load();
    }, [load, rangeToken]);

    const metrics = data?.metrics ?? {};
    const curve = data?.curve ?? [];
    const epsStar = data?.epsStar ?? 0;

    return (
        <div data-testid="clique-homology-page">
            <PageHeader
                kicker="R&D · TDA + Graph Theory · Model 9"
                title={`Clique Homology · ${ticker.symbol}`}
                accent="β₀ · β₁"
                description={`Omologia persistente del complesso di clique indotto dalla matrice di adiacenza pesata di ${ticker.name}. Distanza dᵢⱼ = 1 − |ρᵢⱼ|, filtrazione di Vietoris–Rips, numeri di Betti β₀ e β₁.`}
                actions={
                    <div className="flex items-center gap-2">
                        <StatusBadge status="rnd" />
                        <button
                            type="button"
                            onClick={load}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] border border-[#1B2335] text-slate-400 hover:border-[#2A3550] hover:text-white transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                            {loading ? "Loading…" : "Refresh"}
                        </button>
                        <DataSourceBadge source={error ? "error" : "live"} />
                        <AnalystGuidePanel model="clique" />
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

            {!error && data && !data.error && (
                <div className="mb-6 px-4 py-3 border border-[#00E5C0]/30 bg-[#00E5C0]/[0.05] text-[11px] font-mono text-[#00E5C0]/90 leading-relaxed">
                    Dati live da Yahoo Finance — peer basket: {(data.meta?.peers || []).join(", ")} ·
                    finestra {data.meta?.days_used} gg · regime {data.meta?.interpretation}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="max β₁" value={loading ? "…" : metrics.max_beta1 ?? "—"} sub="cicli indipendenti (picco)" tone="accent" />
                <StatTile
                    label="β₁ persistence"
                    value={loading ? "…" : metrics.betti1_persistence ?? "—"}
                    sub={metrics.betti1_birth != null ? `ε ∈ [${metrics.betti1_birth}, ${metrics.betti1_death}]` : "no loops"}
                    tone="info"
                />
                <StatTile label="Edges @ ε*" value={loading ? "…" : metrics.edges_at_star ?? "—"} sub={`ε* = ${epsStar}`} />
                <StatTile label="Triangles @ ε*" value={loading ? "…" : metrics.triangles_at_star ?? "—"} sub="2-simplici riempiti" tone="warning" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Panel title="Betti Curves" subtitle="β₀, β₁ vs soglia di filtrazione ε" className="xl:col-span-2" testId="betti-curves">
                    <div style={{ height: 360 }}>
                        {chartReady && curve.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={curve} margin={{ top: 10, right: 20, bottom: 24, left: 0 }}>
                                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="eps"
                                        {...axisCommon}
                                        type="number"
                                        domain={[0, 1]}
                                        tickFormatter={(v) => v.toFixed(1)}
                                        label={{ value: "soglia di filtrazione ε", position: "insideBottom", offset: -10, fill: "#64748B", fontSize: 10 }}
                                    />
                                    <YAxis {...axisCommon} width={40} allowDecimals={false} />
                                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `ε = ${Number(l).toFixed(3)}`} />
                                    <RLegend wrapperStyle={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }} />
                                    <ReferenceLine x={epsStar} stroke="#2A3550" strokeDasharray="5 4" label={{ value: "ε*", position: "top", fill: "#64748B", fontSize: 10 }} />
                                    <Line type="stepAfter" dataKey="beta0" name="β₀ (components)" stroke={PALETTE.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
                                    <Line type="stepAfter" dataKey="beta1" name="β₁ (loops)" stroke={accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full bg-[#0E1422] animate-pulse" />
                        )}
                    </div>
                    <div className="mt-4">
                        <Legend
                            items={[
                                { label: "β₀ — componenti connesse", color: PALETTE.blue },
                                { label: "β₁ — cicli (loops)", color: accent },
                            ]}
                        />
                    </div>
                </Panel>

                <Panel title="Clique Complex" subtitle={`network @ ε* = ${epsStar}`} testId="clique-complex">
                    {chartReady && data ? (
                        <CliqueGraph data={data} accent={accent} />
                    ) : (
                        <div className="h-48 bg-[#0E1422] animate-pulse" />
                    )}
                    {data && (
                        <>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div className="border border-[#1B2335] bg-[#0A0F1C] py-2">
                                    <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">V</div>
                                    <div className="text-sm font-mono" style={{ color: accent }}>{data.n}</div>
                                </div>
                                <div className="border border-[#1B2335] bg-[#0A0F1C] py-2">
                                    <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">E</div>
                                    <div className="text-sm font-mono text-slate-200">{data.edges.length}</div>
                                </div>
                                <div className="border border-[#1B2335] bg-[#0A0F1C] py-2">
                                    <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">F</div>
                                    <div className="text-sm font-mono text-slate-200">{data.triangles.length}</div>
                                </div>
                            </div>
                            <p className="mt-3 text-[10px] font-mono text-slate-600 leading-relaxed">
                                χ = V − E + F = {data.n - data.edges.length + data.triangles.length} ·
                                β₁ = β₀ − χ alla soglia ε*.
                            </p>
                        </>
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default CliqueHomologyPage;
