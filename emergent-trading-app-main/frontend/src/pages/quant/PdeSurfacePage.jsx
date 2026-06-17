import React, { useEffect, useState } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";

import {
    PageHeader,
    Panel,
    StatTile,
    StatusBadge,
    RnDBanner,
    PALETTE,
} from "../../components/quant/shared/primitives";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { SafeChart } from "../../components/quant/shared/ChartErrorBoundary";
import { useHorizon } from "../../context/HorizonContext";
import { useDemoData } from "../../hooks/useDemoData";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";

const axisCommon = {
    stroke: "#2A3550",
    tick: { fill: "#64748B", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
    tickLine: { stroke: "#1B2335" },
};

/** Viridis-ish density colour ramp for u ∈ [0, 1] (normalised within surface). */
function densityColor(t) {
    const c = Math.max(0, Math.min(1, t));
    const stops = [
        [13, 17, 33], // deep navy (low)
        [40, 60, 134],
        [33, 144, 141],
        [94, 201, 98],
        [253, 231, 37], // yellow (high)
    ];
    const seg = c * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    const f = seg - i;
    const [r0, g0, b0] = stops[i];
    const [r1, g1, b1] = stops[i + 1];
    return `rgb(${Math.round(r0 + f * (r1 - r0))}, ${Math.round(g0 + f * (g1 - g0))}, ${Math.round(b0 + f * (b1 - b0))})`;
}

/**
 * PDE Density Surface — u(X, T) — R&D mock.
 * Evoluzione della densità di prezzo tramite PDE parabolica (diffusione +
 * drift) risolta con schema implicito. Heatmap spazio-temporale: asse X = tempo
 * futuro T, asse Y = prezzo X, colore = densità di probabilità u(X,T).
 */
const PdeSurfacePage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { data: surface, dataSource, demoMode } = useDemoData(
        async () => {
            const { buildPdeSurface } = await import("../../dev/mock/quantMock");
            return buildPdeSurface(86.0, horizon, undefined, profile);
        },
        [horizon, profile, rangeToken],
    );
    const chartKey = `${horizon}-${rangeToken}-${dataSource}`;
    const chartReady = useChartMountReady(surface ? chartKey : null);
    const [selT, setSelT] = useState(0);

    useEffect(() => {
        if (surface?.T?.length) {
            setSelT(Math.floor(surface.T.length / 2));
        }
    }, [surface?.T?.length]);

    if (!demoMode || !surface) {
        return (
            <div data-testid="pde-surface-page">
                <PageHeader
                    kicker="R&D · Partial Differential Equations"
                    title="PDE Density"
                    accent="Surface"
                    description="Nessun endpoint live. Abilita Demo Mode in Settings."
                    actions={<DataSourceBadge source="error" />}
                />
            </div>
        );
    }

    const { X, T, U, meta } = surface;

    // Max density for normalisation of the colour scale.
    const uMax = Math.max(...U.flat());

    // Cross-section pdf at the selected time column (price vs density).
    const slice = X.map((x, i) => ({ price: x, density: U[i][selT] }));

    // Render Y top→bottom = high price → low price (financial convention).
    const rows = X.map((_, i) => X.length - 1 - i);

    return (
        <div data-testid="pde-surface-page">
            <PageHeader
                kicker="R&D · Partial Differential Equations"
                title="PDE Density"
                accent="Surface"
                description="Evoluzione della densità di prezzo u(X,T) governata da una PDE parabolica locale (diffusione, drift, termine non-lineare) risolta con schemi impliciti."
                actions={
                    <div className="flex items-center gap-2">
                        <DataSourceBadge source={dataSource} />
                        <StatusBadge status="rnd" />
                        <AnalystGuidePanel model="pde" />
                    </div>
                }
            />

            <RnDBanner>
                Modulo in sviluppo — superficie generata dalla soluzione analitica (Green's
                function log-normale) come placeholder. Il solver Crank-Nicolson Python verrà
                cablato su /api/pde/surface.
            </RnDBanner>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Scheme" value="Crank-Nicolson" sub="θ = 0.5 · implicit" tone="accent" />
                <StatTile label="Diffusion σ" value={meta.sigma.toFixed(2)} sub={`drift μ = ${meta.mu.toFixed(2)}`} tone="info" />
                <StatTile label="Grid" value={`${X.length}×${T.length}`} sub={`dx=${meta.dx} · dt=${meta.dt}`} />
                <StatTile label="Stability" value="Unconditional" sub="implicit scheme" tone="positive" />
            </div>

            <Panel
                title="u(X, T) — Space-Time Density Heatmap"
                subtitle={meta.equation}
                testId="pde-heatmap"
            >
                <div className="flex gap-3">
                    {/* Y axis labels */}
                    <div className="flex flex-col justify-between py-1 text-[9px] font-mono text-slate-600 text-right shrink-0 w-12">
                        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                            <span key={f}>{X[Math.round((X.length - 1) * (1 - f))].toFixed(0)}</span>
                        ))}
                    </div>

                    {/* Heatmap grid */}
                    <div className="flex-1 overflow-x-auto">
                        <div
                            className="grid gap-[1px]"
                            style={{
                                gridTemplateColumns: `repeat(${T.length}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${X.length}, 6px)`,
                            }}
                        >
                            {rows.map((ri) =>
                                T.map((_, cj) => (
                                    <div
                                        key={`${ri}-${cj}`}
                                        onClick={() => setSelT(cj)}
                                        title={`X=${X[ri].toFixed(1)} · T=${T[cj]} · u=${U[ri][cj].toFixed(5)}`}
                                        style={{
                                            background: densityColor(U[ri][cj] / (uMax || 1)),
                                            outline: cj === selT ? "1px solid rgba(0,229,192,0.6)" : "none",
                                            cursor: "pointer",
                                        }}
                                    />
                                )),
                            )}
                        </div>
                        {/* X axis labels */}
                        <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-600">
                            <span>T+1</span>
                            <span>T+{Math.round(T.length / 2)}</span>
                            <span>T+{T.length}</span>
                        </div>
                    </div>
                </div>

                {/* Colour scale legend */}
                <div className="flex items-center gap-3 mt-5">
                    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">u(X,T) density</span>
                    <div className="flex-1 h-2 max-w-xs" style={{
                        background: `linear-gradient(90deg, ${densityColor(0)}, ${densityColor(0.25)}, ${densityColor(0.5)}, ${densityColor(0.75)}, ${densityColor(1)})`,
                    }} />
                    <span className="text-[9px] font-mono text-slate-600">low → high</span>
                </div>
            </Panel>

            <Panel
                title={`Density Cross-Section · T+${T[selT]}`}
                subtitle="marginal price pdf u(·, T) at selected horizon — click heatmap columns"
                className="mt-6"
                testId="pde-slice"
            >
                <SafeChart ready={chartReady} resetKey={chartKey} minHeight={280}>
                    <div style={{ height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={slice} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                <defs>
                                    <linearGradient id="pdeSlice" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={PALETTE.accent} stopOpacity={0.4} />
                                        <stop offset="100%" stopColor={PALETTE.accent} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                                <XAxis dataKey="price" {...axisCommon} tickFormatter={(v) => v.toFixed(0)} minTickGap={28} />
                                <YAxis {...axisCommon} tickFormatter={(v) => v.toFixed(3)} width={52} />
                                <Tooltip
                                    contentStyle={{ background: "#0A0F1C", border: "1px solid #2A3550", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
                                    formatter={(v) => Number(v).toFixed(5)}
                                    labelFormatter={(l) => `X = ${Number(l).toFixed(2)}`}
                                />
                                <Area type="monotone" dataKey="density" name="u(X,T)" stroke={PALETTE.accent} strokeWidth={1.6} fill="url(#pdeSlice)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </SafeChart>
            </Panel>
        </div>
    );
};

export default PdeSurfacePage;
