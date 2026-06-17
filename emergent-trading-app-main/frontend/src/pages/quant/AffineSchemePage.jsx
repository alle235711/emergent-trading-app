/**
 * AffineSchemePage.jsx — Model 11
 * Live affine scheme microstructure from Yahoo OHLCV.
 */

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
    PageHeader,
    Panel,
    StatTile,
    StatusBadge,
    PALETTE,
} from "../../components/quant/shared/primitives";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { tickerAccent } from "../../lib/tickers";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { fetchAffineScheme } from "../../lib/api";

const ISO = Math.cos(Math.PI / 6);
const ISS = Math.sin(Math.PI / 6);

const project = (p) => ({
    sx: (p.x - p.y) * ISO,
    sy: (p.x + p.y) * ISS - p.z,
    depth: p.x + p.y + p.z,
});

const zColor = (z) => {
    const t = Math.max(0, Math.min(1, (z + 1.6) / 3.2));
    const r = Math.round(79 + (0 - 79) * t);
    const g = Math.round(139 + (229 - 139) * t);
    const b = Math.round(255 + (192 - 255) * t);
    return `rgb(${r},${g},${b})`;
};

const kindColor = (kind) =>
    kind === "crash" ? PALETTE.danger : kind === "inversion" ? PALETTE.warn : PALETTE.accent;

const adaptSchemeResult = (result) => {
    const st = result.singularity_type;
    const points = (result.variety_points || []).map(([x, y, z]) => ({ x, y, z }));
    const singularities = [
        {
            x: 0,
            y: 0,
            z: result.b * 0.4,
            type: st === "cusp" ? "cusp" : st === "node" ? "node" : "isolated",
            kind: st === "cusp" ? "crash" : st === "node" ? "inversion" : "stable",
            severity: Math.max(0, Math.min(1, 1 - result.smoothness_score)),
        },
    ];
    return {
        params: { a: result.a, b: result.b, discriminant: result.discriminant },
        ring: `k[x,y] / (y² − x³ − ${result.a}x² − ${result.b}x)`,
        points,
        singularities,
        metrics: {
            krull_dim: 1,
            n_singular: result.n_singular_windows,
            discriminant: result.discriminant,
            smoothness: result.smoothness_score,
            regime:
                st === "cusp"
                    ? "Cuspidal · crash precursor"
                    : st === "node"
                      ? "Nodal · structural inversion"
                      : "Smooth · elliptic",
            arithmetic_genus: st === "cusp" || st === "node" ? 0 : 1,
        },
        meta: { days_used: result.days_used },
    };
};

const VarietyScatter = ({ data }) => {
    const W = 560;
    const H = 380;
    const all = [...data.points, ...data.singularities].map(project);
    const xs = all.map((p) => p.sx);
    const ys = all.map((p) => p.sy);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 36;
    const sx = (v) => pad + ((v - minX) / (maxX - minX || 1)) * (W - 2 * pad);
    const sy = (v) => H - pad - ((v - minY) / (maxY - minY || 1)) * (H - 2 * pad);

    const sorted = data.points.map((p) => ({ ...p, ...project(p) })).sort((a, b) => a.depth - b.depth);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" data-testid="variety-scatter">
            {[
                { v: { x: 1.7, y: 0, z: 0 }, label: "x" },
                { v: { x: 0, y: 1.7, z: 0 }, label: "y" },
                { v: { x: 0, y: 0, z: 1.7 }, label: "z = ∂P/∂V" },
            ].map((ax, i) => {
                const o = project({ x: 0, y: 0, z: 0 });
                const e = project(ax.v);
                return (
                    <g key={i}>
                        <line x1={sx(o.sx)} y1={sy(o.sy)} x2={sx(e.sx)} y2={sy(e.sy)} stroke="#2A3550" strokeWidth={1} />
                        <text x={sx(e.sx)} y={sy(e.sy)} fill="#64748B" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9 }} dx={4}>
                            {ax.label}
                        </text>
                    </g>
                );
            })}
            {sorted.map((p, i) => (
                <circle key={i} cx={sx(p.sx)} cy={sy(p.sy)} r={1.6 + (p.depth + 3) * 0.4} fill={zColor(p.z)} fillOpacity={0.7} />
            ))}
            {data.singularities.map((s, i) => {
                const p = project(s);
                const r = 5 + s.severity * 6;
                const c = kindColor(s.kind);
                return (
                    <g key={`sing-${i}`}>
                        <circle cx={sx(p.sx)} cy={sy(p.sy)} r={r + 5} fill="none" stroke={c} strokeOpacity={0.4} strokeWidth={1} />
                        <rect
                            x={sx(p.sx) - r}
                            y={sy(p.sy) - r}
                            width={r * 2}
                            height={r * 2}
                            transform={`rotate(45 ${sx(p.sx)} ${sy(p.sy)})`}
                            fill={c}
                            fillOpacity={0.85}
                        />
                    </g>
                );
            })}
        </svg>
    );
};

const AffineSchemePage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { ticker } = useTicker();
    const accent = tickerAccent(ticker);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchAffineScheme(ticker.symbol, {
                days: Math.max(60, profile.steps),
                horizon,
            });
            setData(adaptSchemeResult(payload.result));
        } catch (err) {
            const msg = err?.response?.data?.detail ?? err?.message ?? "Backend non raggiungibile";
            setError(msg);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [ticker.symbol, profile.steps, horizon]);

    useEffect(() => {
        load();
    }, [load, rangeToken]);

    const metrics = data?.metrics ?? {};
    const params = data?.params ?? {};
    const singularities = data?.singularities ?? [];

    return (
        <div data-testid="affine-scheme-page">
            <PageHeader
                kicker="R&D · Affine Schemes · Model 11"
                title={`Affine Scheme · ${ticker.symbol}`}
                accent="Spec(R)"
                description={`Microstruttura di ${ticker.name} come schema affine Spec(R) su anello polinomiale. Tracciamento delle singolarità algebriche del luogo degli zeri delle sensitività prezzo-volume.`}
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
                        <AnalystGuidePanel model="scheme" />
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
                    Dati live da Yahoo Finance · finestra {data.meta?.days_used} gg · Weierstrass cubic fit
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Singolarità" value={loading ? "…" : metrics.n_singular ?? "—"} sub="Sing(V) rilevate" tone={metrics.n_singular > 2 ? "negative" : "warning"} />
                <StatTile label="Discriminante Δ" value={loading ? "…" : params.discriminant ?? "—"} sub="segno → tipo singolarità" tone="info" />
                <StatTile label="Smoothness" value={loading ? "…" : metrics.smoothness != null ? `${(metrics.smoothness * 100).toFixed(0)}%` : "—"} sub="regolarità varietà" tone="accent" />
                <StatTile label="Genere · dim" value={loading ? "…" : `${metrics.arithmetic_genus ?? "—"} · ${metrics.krull_dim ?? "—"}`} sub="aritmetico · Krull" />
            </div>

            {data && (
                <div className="mb-6 px-4 py-3 border border-[#1B2335] bg-[#0A0F1C] flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600">Ring R =</span>
                    <span className="text-[13px] font-mono" style={{ color: accent }}>{data.ring}</span>
                    <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-1 border" style={{ color: accent, borderColor: `${accent}55` }}>
                        {metrics.regime}
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Panel title="Algebraic Variety V(f)" subtitle="scatter 3-D (proiezione isometrica) · z = ∂P/∂V" className="xl:col-span-2" testId="variety-panel">
                    {loading || !data ? (
                        <div className="h-64 bg-[#0E1422] animate-pulse" />
                    ) : (
                        <VarietyScatter data={data} />
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                        <span className="flex items-center gap-2"><span className="w-3 h-3" style={{ background: PALETTE.danger, transform: "rotate(45deg)" }} /> crash (cuspide)</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3" style={{ background: PALETTE.warn, transform: "rotate(45deg)" }} /> inversione (nodo)</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: zColor(1.6) }} /> sensitività alta</span>
                    </div>
                </Panel>

                <Panel title="Singularity Detection" subtitle="Sing(V) = {f = ∂ₓf = ∂_y f = 0}" testId="singularity-panel">
                    <div className="space-y-2">
                        {singularities.map((s, i) => {
                            const c = kindColor(s.kind);
                            return (
                                <div key={i} className="border border-[#1B2335] bg-[#0A0F1C] p-3" style={{ borderLeft: `2px solid ${c}` }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: c }}>
                                            {s.type} · {s.kind}
                                        </span>
                                        <span className="text-[11px] font-mono text-slate-300">sev {(s.severity * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="mt-1 text-[10px] font-mono text-slate-600">
                                        ({s.x}, {s.y}, {s.z})
                                    </div>
                                    <div className="mt-1.5 h-1 bg-[#1B2335]">
                                        <div className="h-full" style={{ width: `${s.severity * 100}%`, background: c }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {metrics.n_singular > 2 && (
                        <div className="mt-4 border border-[#FF4D5E]/40 bg-[#FF4D5E]/[0.06] px-3 py-2 text-[10px] font-mono text-[#FF4D5E] uppercase tracking-[0.2em]">
                            ⚠ Varietà fortemente singolare — rischio di rottura strutturale
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default AffineSchemePage;
