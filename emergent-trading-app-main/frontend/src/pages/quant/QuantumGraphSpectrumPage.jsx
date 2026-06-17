/**
 * QuantumGraphSpectrumPage.jsx — Model 13
 * Live Marchenko–Pastur spectral analysis of cross-section correlation matrix.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import { RefreshCw } from "lucide-react";
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    Cell,
} from "recharts";

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
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { fetchQuantumGraphSpectrum } from "../../lib/api";

const adaptSpectrumResult = (result) => {
    const evals = result.eigenvalues || [];
    const lamPlus = result.lambda_max;
    const lamMinus = result.lambda_min;
    const BINS = 34;
    const hiEdge = Math.max(lamPlus * 1.15, evals[0] * 1.02, 1);
    const binW = hiEdge / BINS;
    const counts = new Array(BINS).fill(0);
    evals.forEach((v) => {
        const b = Math.min(BINS - 1, Math.max(0, Math.floor(v / binW)));
        counts[b]++;
    });
    const mpMap = new Map((result.mp_curve || []).map(([l, d]) => [Number(l.toFixed(3)), d]));
    const histogram = counts.map((c, i) => {
        const center = (i + 0.5) * binW;
        return {
            x: Number(center.toFixed(3)),
            density: Number((c / (evals.length * binW)).toFixed(4)),
            mp: mpMap.get(Number(center.toFixed(3))) ?? 0,
        };
    });

    const isolated = evals
        .filter((v) => v > lamPlus)
        .sort((a, b) => b - a)
        .map((v, i) => ({
            value: Number(v.toFixed(3)),
            gap: Number((v - lamPlus).toFixed(3)),
            label: i === 0 ? "Market mode" : `Factor ${i}`,
        }));

    return {
        histogram,
        isolated,
        params: {
            N: result.n_assets,
            T: result.T,
            q: result.q,
            sigma2: result.bulk_variance,
            lambdaMinus: lamMinus,
            lambdaPlus: lamPlus,
        },
        metrics: {
            n_isolated: result.n_signal,
            largest_eigenvalue: evals.length ? Number(Math.max(...evals).toFixed(3)) : 0,
            spectral_gap: result.spectral_gap,
            bulk_edge: lamPlus,
            anomaly: result.interpretation === "concentrated" || result.n_signal >= 3,
            participation: Number(Math.min(1, 0.4 + result.n_signal / Math.max(1, result.n_assets)).toFixed(3)),
        },
        meta: { days_used: result.days_used, interpretation: result.interpretation },
    };
};

const QuantumGraphSpectrumPage = () => {
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
            const payload = await fetchQuantumGraphSpectrum(ticker.symbol, {
                days: Math.max(120, profile.steps),
                horizon,
                n_assets: Math.min(64, Math.max(20, ticker.nNodes || 30)),
            });
            setData(adaptSpectrumResult(payload.result));
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

    const histogram = data?.histogram ?? [];
    const isolated = data?.isolated ?? [];
    const params = data?.params ?? { lambdaPlus: 1 };
    const metrics = data?.metrics ?? {};

    const xMax = useMemo(() => {
        const lastBin = histogram.length ? histogram[histogram.length - 1].x : params.lambdaPlus;
        const maxIso = isolated.length ? Math.max(...isolated.map((e) => e.value)) : 0;
        return Math.ceil(Math.max(lastBin, maxIso, params.lambdaPlus) * 1.05);
    }, [histogram, isolated, params]);

    return (
        <div data-testid="quantum-graph-spectrum-page">
            <PageHeader
                kicker="R&D · Random Matrix Theory · Model 13"
                title={`Quantum Graph Spectrum · ${ticker.symbol}`}
                accent="σ(Δ)"
                description={`Spettro dell'operatore differenziale definito sulle metriche degli archi del grafo di volatilità multi-asset di ${ticker.name}. Densità spettrale (RMT) con autovalori isolati che rompono il bulk.`}
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
                        <AnalystGuidePanel model="spectrum" />
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
                    Dati live da Yahoo Finance · N={params.N} · T={params.T} · q={params.q} · regime {data.meta?.interpretation}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Largest λ" value={loading ? "…" : metrics.largest_eigenvalue ?? "—"} sub="market mode" tone={metrics.anomaly ? "negative" : "accent"} />
                <StatTile label="Spectral gap" value={loading ? "…" : metrics.spectral_gap ?? "—"} sub={`λ₊ = ${params.lambdaPlus}`} tone="warning" />
                <StatTile label="Isolated λ" value={loading ? "…" : metrics.n_isolated ?? "—"} sub="fattori sistemici" tone="info" />
                <StatTile label="N · T · q" value={loading ? "…" : `${params.N}·${params.T}`} sub={`q = N/T = ${params.q}`} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Panel title="Spectral Density" subtitle="istogramma empirico vs Marchenko–Pastur · autovalori isolati evidenziati" className="xl:col-span-2" testId="spectral-density">
                    <div style={{ height: 380 }}>
                        {chartReady && histogram.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={histogram} margin={{ top: 10, right: 20, bottom: 24, left: 0 }}>
                                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="x"
                                        type="number"
                                        domain={[0, xMax]}
                                        allowDataOverflow
                                        {...axisCommon}
                                        tickFormatter={(v) => Number(v).toFixed(1)}
                                        label={{ value: "autovalore λ", position: "insideBottom", offset: -10, fill: "#64748B", fontSize: 10 }}
                                    />
                                    <YAxis {...axisCommon} width={42} tickFormatter={(v) => Number(v).toFixed(1)} />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [Number(v).toFixed(3), n]} labelFormatter={(l) => `λ ≈ ${Number(l).toFixed(3)}`} />
                                    <ReferenceLine x={params.lambdaMinus} stroke="#2A3550" strokeDasharray="4 4" label={{ value: "λ₋", position: "top", fill: "#64748B", fontSize: 9 }} />
                                    <ReferenceLine x={params.lambdaPlus} stroke="#FFB020" strokeDasharray="4 4" label={{ value: "λ₊", position: "top", fill: "#FFB020", fontSize: 9 }} />
                                    {isolated.map((e, i) => (
                                        <ReferenceLine key={i} x={e.value} stroke={PALETTE.danger} strokeWidth={1.4} label={{ value: e.label, position: "top", fill: PALETTE.danger, fontSize: 8 }} />
                                    ))}
                                    <Bar dataKey="density" name="densità empirica" maxBarSize={14} isAnimationActive={false}>
                                        {histogram.map((d, i) => (
                                            <Cell key={i} fill={d.x > params.lambdaPlus ? PALETTE.danger : PALETTE.blue} fillOpacity={d.x > params.lambdaPlus ? 0.85 : 0.5} />
                                        ))}
                                    </Bar>
                                    <Line type="monotone" dataKey="mp" name="Marchenko–Pastur" stroke={PALETTE.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full bg-[#0E1422] animate-pulse" />
                        )}
                    </div>
                    <div className="mt-4">
                        <Legend
                            items={[
                                { label: "bulk (RMT null)", color: PALETTE.blue },
                                { label: "Marchenko–Pastur", color: PALETTE.accent },
                                { label: "λ isolati (anomalia)", color: PALETTE.danger },
                            ]}
                        />
                    </div>
                </Panel>

                <Panel title="Isolated Eigenvalues" subtitle="fattori che rompono il bulk" testId="isolated-eigenvalues">
                    <div className="space-y-2">
                        {isolated.length === 0 && !loading && (
                            <div className="text-[11px] font-mono text-slate-500 border border-[#1B2335] px-3 py-2">
                                Nessun autovalore isolato oltre λ₊
                            </div>
                        )}
                        {isolated.map((e, i) => (
                            <div key={i} className="border border-[#1B2335] bg-[#0A0F1C] p-3" style={{ borderLeft: `2px solid ${i === 0 ? PALETTE.danger : PALETTE.warn}` }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: i === 0 ? PALETTE.danger : PALETTE.warn }}>
                                        {e.label}
                                    </span>
                                    <span className="text-sm font-mono text-slate-200">λ = {e.value}</span>
                                </div>
                                <div className="mt-1 text-[10px] font-mono text-slate-600">
                                    gap oltre λ₊ : {e.gap}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 border border-[#1B2335] bg-[#0E1422] p-3">
                        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1">Participation ratio</div>
                        <div className="text-lg font-mono" style={{ color: PALETTE.accent }}>{((metrics.participation ?? 0) * 100).toFixed(0)}%</div>
                    </div>
                    {metrics.anomaly && (
                        <div className="mt-4 border border-[#FF4D5E]/40 bg-[#FF4D5E]/[0.06] px-3 py-2 text-[10px] font-mono text-[#FF4D5E] uppercase tracking-[0.2em]">
                            ⚠ Anomalia sistemica — struttura fuori dal bulk RMT
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default QuantumGraphSpectrumPage;
