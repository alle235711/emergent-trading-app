/**
 * HodgeDecompositionPage.jsx — Model 12
 * Live discrete Hodge decomposition of cross-asset return flows.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import { RefreshCw } from "lucide-react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";

import {
    PageHeader,
    Panel,
    StatTile,
    StatusBadge,
    PALETTE,
} from "../../components/quant/shared/primitives";
import { axisCommon, tooltipStyle, gridStroke } from "../../components/quant/shared/chartTheme";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { fetchHodgeDecompose } from "../../lib/api";

const COMP = [
    { key: "gradient", label: "Gradient", sub: "Trend (curl-free)", color: PALETTE.accent, math: "grad(p)" },
    { key: "solenoidal", label: "Solenoidal", sub: "Cyclic Arbitrage", color: PALETTE.purple, math: "curl(A)" },
    { key: "harmonic", label: "Harmonic", sub: "Macro Equilibrium", color: PALETTE.blue, math: "h" },
];

const INTERP_LABELS = {
    trend_dominant: "Gradient · Trend",
    cyclic_dominant: "Solenoidal · Cyclic Arbitrage",
    equilibrium: "Harmonic · Macro Equilibrium",
};

const adaptHodgeResult = (result) => {
    const labels = result.peers || [];
    const components = {
        gradient: result.gradient_pct,
        solenoidal: result.solenoidal_pct,
        harmonic: result.harmonic_pct,
    };
    const topBy = (idx) =>
        [...(result.edge_flows || [])]
            .map(([i, j, , grad, curl, harm]) => ({
                label: `${labels[i]}→${labels[j]}`,
                value: Math.abs([grad, curl, harm][idx]),
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 7)
            .map((e) => ({ label: e.label, value: Number(e.value.toFixed(4)) }));

    const totalEnergy = (result.edge_flows || []).reduce((acc, [, , flow]) => acc + flow * flow, 0);

    return {
        components,
        perEdge: {
            gradient: topBy(0),
            solenoidal: topBy(1),
            harmonic: topBy(2),
        },
        metrics: {
            dominant: INTERP_LABELS[result.interpretation] || result.interpretation,
            total_energy: Number(totalEnergy.toFixed(4)),
            trend_strength: result.gradient_pct,
            arbitrage_cycles: Math.max(0, (result.edge_flows?.length ?? 0) - labels.length + 1),
            harmonic_rank: result.harmonic_pct > 0.2 ? "elevated" : "low",
        },
        meta: { peers: result.peers, days_used: result.days_used },
    };
};

const ComponentColumn = ({ comp, pct, edges }) => (
    <Panel title={comp.label} subtitle={comp.sub} testId={`hodge-${comp.key}`}>
        <div className="text-center mb-3">
            <div className="text-3xl font-mono font-medium" style={{ color: comp.color }}>
                {(pct * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600 mt-1">
                share di energia · {comp.math}
            </div>
        </div>
        <div className="h-1.5 bg-[#1B2335] mb-4">
            <div className="h-full" style={{ width: `${pct * 100}%`, background: comp.color }} />
        </div>
        <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={edges} layout="vertical" margin={{ top: 2, right: 12, bottom: 2, left: 4 }}>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" {...axisCommon} tickFormatter={(v) => v.toFixed(1)} />
                    <YAxis type="category" dataKey="label" {...axisCommon} width={86} tick={{ fill: "#64748B", fontSize: 8, fontFamily: "JetBrains Mono, monospace" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => Number(v).toFixed(3)} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="value" name={comp.label} fill={comp.color} isAnimationActive={false}>
                        {edges.map((_, i) => (
                            <Cell key={i} fill={comp.color} fillOpacity={0.85 - i * 0.07} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    </Panel>
);

const HodgeDecompositionPage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { ticker } = useTicker();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const chartKey = `${ticker.symbol}-${horizon}-${rangeToken}`;
    const chartReady = useChartMountReady(!loading && data ? chartKey : null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchHodgeDecompose(ticker.symbol, {
                days: Math.max(30, profile.steps),
                horizon,
                n_assets: Math.min(12, Math.max(7, ticker.nNodes || 8)),
            });
            setData(adaptHodgeResult(payload.result));
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

    const components = data?.components ?? {};
    const perEdge = data?.perEdge ?? {};
    const metrics = data?.metrics ?? {};

    return (
        <div data-testid="hodge-decomposition-page">
            <PageHeader
                kicker="R&D · Discrete Hodge Laplacian · Model 12"
                title={`Hodge Decomposition · ${ticker.symbol}`}
                accent="grad · curl · h"
                description={`Decomposizione del campo di flusso del portafoglio di ${ticker.name} tramite il Laplaciano di Hodge discreto: X = grad(p) + curl(A) + h.`}
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
                        <AnalystGuidePanel model="hodge" />
                    </div>
                }
            />

            {error && (
                <div className="mb-6 px-4 py-3 border border-[#FF4D5E]/40 bg-[#FF4D5E]/[0.06] text-[11px] font-mono text-[#FF9AA5]">
                    Errore nel caricamento dati live: {error}
                </div>
            )}

            {!error && data && (
                <div className="mb-6 px-4 py-3 border border-[#00E5C0]/30 bg-[#00E5C0]/[0.05] text-[11px] font-mono text-[#00E5C0]/90 leading-relaxed">
                    Dati live da Yahoo Finance — peer basket: {(data.meta?.peers || []).join(", ")} ·
                    finestra {data.meta?.days_used} gg
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Componente dominante" value={loading ? "…" : metrics.dominant?.split(" · ")[0] ?? "—"} sub={metrics.dominant?.split(" · ")[1] || ""} tone="accent" />
                <StatTile label="Trend strength" value={loading ? "…" : `${((metrics.trend_strength ?? 0) * 100).toFixed(0)}%`} sub="quota gradiente" tone="info" />
                <StatTile label="Arbitrage cycles" value={loading ? "…" : metrics.arbitrage_cycles ?? "—"} sub="loop indipendenti (curl)" tone="warning" />
                <StatTile label="Total energy" value={loading ? "…" : metrics.total_energy ?? "—"} sub={`harmonic ${metrics.harmonic_rank ?? ""}`} />
            </div>

            <div className="mb-6 border border-[#1B2335] bg-[#0E1422] p-5">
                <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-slate-400 mb-3">
                    Hodge composition · X = grad(p) + curl(A) + h
                </div>
                {loading || !data ? (
                    <div className="h-7 bg-[#0E1422] animate-pulse" />
                ) : (
                    <div className="flex h-7 w-full overflow-hidden border border-[#1B2335]">
                        {COMP.map((c) => (
                            <div
                                key={c.key}
                                className="h-full flex items-center justify-center text-[9px] font-mono text-black/80"
                                style={{ width: `${(components[c.key] ?? 0) * 100}%`, background: c.color }}
                                title={`${c.label} ${((components[c.key] ?? 0) * 100).toFixed(1)}%`}
                            >
                                {(components[c.key] ?? 0) > 0.08 ? `${((components[c.key] ?? 0) * 100).toFixed(0)}%` : ""}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {chartReady && data
                    ? COMP.map((c) => (
                          <ComponentColumn key={c.key} comp={c} pct={components[c.key] ?? 0} edges={perEdge[c.key] ?? []} />
                      ))
                    : COMP.map((c) => (
                          <div key={c.key} className="h-64 bg-[#0E1422] animate-pulse border border-[#1B2335]" />
                      ))}
            </div>
        </div>
    );
};

export default HodgeDecompositionPage;
