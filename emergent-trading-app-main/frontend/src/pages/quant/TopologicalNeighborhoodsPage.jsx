import React, { useMemo } from "react";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    BarChart,
    Bar,
    Cell,
} from "recharts";

import {
    PageHeader,
    Panel,
    StatTile,
    Gauge,
    StatusBadge,
    RnDBanner,
    Legend,
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

const PersistenceTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div className="font-mono text-[11px] px-3 py-2 bg-[#0A0F1C] border border-[#2A3550]">
            <div className="text-slate-500 text-[10px] uppercase tracking-[0.2em] mb-1">
                H{d.dim} feature
            </div>
            <div className="text-slate-300">birth {d.birth.toFixed(3)}</div>
            <div className="text-slate-300">death {d.death.toFixed(3)}</div>
            <div className="text-[#00E5C0]">persistence {d.persistence.toFixed(3)}</div>
        </div>
    );
};

/**
 * Topological Neighborhoods (TDA · Delay Embedding) — R&D mock.
 * Palle euclidee nello spazio di embedding e omologia persistente per misurare
 * la robustezza della traiettoria locale. Persistence diagram (scatter
 * birth-death) + barcode di persistenza + indicatore di "Evoluzione locale".
 */
const TopologicalNeighborhoodsPage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { data, dataSource, demoMode } = useDemoData(
        async () => {
            const { buildPersistenceDiagram } = await import("../../dev/mock/quantMock");
            return buildPersistenceDiagram(horizon, undefined, profile);
        },
        [horizon, profile, rangeToken],
    );

    const chartKey = `${horizon}-${rangeToken}-${dataSource}`;
    const chartReady = useChartMountReady(data ? chartKey : null);

    if (!demoMode || !data) {
        return (
            <div data-testid="topological-neighborhoods-page">
                <PageHeader
                    kicker="R&D · Topological Data Analysis"
                    title="Topological"
                    accent="Neighborhoods"
                    description="Nessun endpoint live. Abilita Demo Mode in Settings."
                    actions={<DataSourceBadge source="error" />}
                />
            </div>
        );
    }

    const { pairs, embedding, metrics } = data;

    const h0 = pairs.filter((p) => p.dim === 0);
    const h1 = pairs.filter((p) => p.dim === 1);
    const maxAxis = Math.max(...pairs.map((p) => p.death)) * 1.05;

    // Barcode: sorted by persistence desc for the bar chart.
    const barcode = [...pairs]
        .filter((p) => p.death < 1)
        .sort((a, b) => b.persistence - a.persistence)
        .slice(0, 16)
        .map((p, i) => ({ ...p, idx: i }));

    return (
        <div data-testid="topological-neighborhoods-page">
            <PageHeader
                kicker="R&D · Topological Data Analysis"
                title="Topological"
                accent="Neighborhoods"
                description="Vicinati locali via palle euclidee nello spazio di delay-embedding; omologia persistente per misurare la robustezza della traiettoria locale."
                actions={
                    <div className="flex items-center gap-2">
                        <DataSourceBadge source={dataSource} />
                        <StatusBadge status="mock" />
                        <AnalystGuidePanel model="neighborhoods" />
                    </div>
                }
            />

            <RnDBanner>
                Modulo in sviluppo — i diagrammi mostrano dati mockizzati strutturati secondo
                l'omologia persistente (birth ≤ death). Il solver Python (Vietoris-Rips +
                ripser) verrà cablato su /api/tda/full.
            </RnDBanner>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Embedding dim (d)" value={embedding.d} sub={`τ = ${embedding.tau} (delay)`} tone="accent" />
                <StatTile label="Ball radius ε" value={embedding.epsilon.toFixed(2)} sub={`${embedding.n_neighbors} neighbors`} tone="info" />
                <StatTile label="Betti (β₀, β₁)" value={`${metrics.betti_0}, ${metrics.betti_1}`} sub="persistent features" />
                <StatTile label="Max persistence H₁" value={metrics.max_persistence_h1.toFixed(3)} sub="robustness" tone="positive" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Panel
                    title="Persistence Diagram"
                    subtitle="birth-death scatter · points far from diagonal = robust"
                    className="xl:col-span-2"
                    testId="persistence-diagram"
                >
                    <div style={{ height: 420 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 12, right: 20, bottom: 16, left: 0 }}>
                                <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                                <XAxis
                                    type="number"
                                    dataKey="birth"
                                    name="birth"
                                    domain={[0, maxAxis]}
                                    {...axisCommon}
                                    label={{ value: "birth", position: "insideBottom", offset: -8, fill: "#64748B", fontSize: 10 }}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="death"
                                    name="death"
                                    domain={[0, maxAxis]}
                                    {...axisCommon}
                                    label={{ value: "death", angle: -90, position: "insideLeft", fill: "#64748B", fontSize: 10 }}
                                />
                                <ZAxis type="number" dataKey="persistence" range={[40, 320]} />
                                <Tooltip content={<PersistenceTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#2A3550" }} />
                                <ReferenceLine
                                    segment={[
                                        { x: 0, y: 0 },
                                        { x: maxAxis, y: maxAxis },
                                    ]}
                                    stroke="#2A3550"
                                    strokeDasharray="4 4"
                                />
                                <Scatter name="H0" data={h0} fill={PALETTE.blue} fillOpacity={0.7} />
                                <Scatter name="H1" data={h1} fill={PALETTE.accent} fillOpacity={0.85} />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4">
                        <Legend
                            items={[
                                { label: "H₀ components", color: PALETTE.blue },
                                { label: "H₁ loops", color: PALETTE.accent },
                                { label: "diagonal (noise)", color: "#2A3550" },
                            ]}
                        />
                    </div>
                </Panel>

                <Panel
                    title="Local Evolution"
                    subtitle="topological ball stability"
                    testId="local-evolution"
                >
                    <div className="flex flex-col items-center">
                        <Gauge value={metrics.local_evolution} label="Stability of local ball" />
                    </div>
                    <div className="mt-4 space-y-2 text-[11px] font-mono">
                        <Row label="Total persistence" value={metrics.total_persistence.toFixed(3)} />
                        <Row label="β₀ (components)" value={metrics.betti_0} />
                        <Row label="β₁ (loops)" value={metrics.betti_1} />
                        <Row label="Window length" value={`${embedding.window} bars`} />
                    </div>
                    <p className="mt-4 text-[10px] font-mono text-slate-600 leading-relaxed">
                        L'evoluzione locale misura quanto la struttura topologica della palla
                        ε-vicina resta invariata mentre la finestra di embedding scorre. Valori
                        alti ⇒ geometria locale robusta e predicibile.
                    </p>
                </Panel>
            </div>

            <Panel
                title="Persistence Barcode"
                subtitle="feature lifespan (death − birth), longest = most significant"
                className="mt-6"
                testId="barcode"
            >
                <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barcode} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                            <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" {...axisCommon} domain={[0, "auto"]} />
                            <YAxis type="category" dataKey="idx" {...axisCommon} width={28} tickFormatter={() => ""} />
                            <Tooltip content={<PersistenceTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                            <Bar dataKey="persistence" barSize={9} isAnimationActive={false}>
                                {barcode.map((b, i) => (
                                    <Cell key={i} fill={b.dim === 1 ? PALETTE.accent : PALETTE.blue} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Panel>
        </div>
    );
};

const Row = ({ label, value }) => (
    <div className="flex items-center justify-between border-b border-[#1B2335] pb-1.5">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-200">{value}</span>
    </div>
);

export default TopologicalNeighborhoodsPage;
