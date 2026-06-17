import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";
import { ArrowUpRight } from "lucide-react";

import {
    PageHeader,
    Panel,
    RiskLight,
    Gauge,
    StatTile,
    StatusBadge,
    PALETTE,
} from "../../components/quant/shared/primitives";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { SafeChart } from "../../components/quant/shared/ChartErrorBoundary";
import { ALL_NAV_ITEMS } from "../../config/navigation";
import { useHorizon } from "../../context/HorizonContext";
import { useDemoData } from "../../hooks/useDemoData";
import { useChartMountReady } from "../../hooks/useChartMountReady";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";
import PaperTradingPanel from "../../components/quant/PaperTradingPanel";

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
};

/**
 * Master Quant Dashboard — the systemic-risk hub.
 *
 * Aggregates: Bayesian risk semaphores, dynamic Global VaR (from the SDE
 * ensemble), the global topological regime status, and a live grid of every
 * model room with its health. This is the institutional "control room".
 */
const MasterDashboard = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { data: state, dataSource, demoMode } = useDemoData(
        async () => {
            const { buildSystemicRiskState } = await import("../../dev/mock/quantMock");
            return buildSystemicRiskState(horizon, undefined, profile);
        },
        [horizon, profile, rangeToken],
    );
    const chartKey = `${horizon}-${rangeToken}-${dataSource}`;
    const chartReady = useChartMountReady(state ? chartKey : null);

    if (!demoMode || !state) {
        return (
            <div data-testid="master-dashboard">
                <PageHeader
                    kicker="Command · Systemic Risk"
                    title="Master Quant"
                    accent="Dashboard"
                    description="Aggregazione dello stato di rischio sistemico. Abilita Demo Mode in Settings per dati sintetici di anteprima."
                    actions={<DataSourceBadge source="error" />}
                />
                <div className="px-4 py-8 border border-[#FF4D5E]/30 bg-[#FF4D5E]/[0.05] text-[11px] font-mono text-[#FF9AA5]">
                    Nessun endpoint live per il Master Dashboard. Abilita <strong>Demo Mode</strong> in Settings per visualizzare dati sintetici (badge MOCK).
                </div>
                <div className="mt-6">
                    <PaperTradingPanel />
                </div>
            </div>
        );
    }

    const { bayesianLights, globalVar, regime, modules } = state;

    const moduleMeta = (id) => ALL_NAV_ITEMS.find((i) => i.id === id);

    // Aggregate systemic score = mean posterior across lights.
    const systemicScore =
        bayesianLights.reduce((s, l) => s + l.posterior, 0) / bayesianLights.length;

    return (
        <div data-testid="master-dashboard">
            <PageHeader
                kicker="Command · Systemic Risk"
                title="Master Quant"
                accent="Dashboard"
                description="Aggregazione dello stato di rischio sistemico in tempo reale: semafori bayesiani, Global VaR dinamico dal modello SDE e stato globale del regime topologico."
                actions={
                    <div className="flex items-center gap-2">
                        <DataSourceBadge source={dataSource} />
                        <AnalystGuidePanel model="master" />
                    </div>
                }
            />

            {/* Top KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile
                    label="Systemic Risk Index"
                    value={`${(systemicScore * 100).toFixed(1)}%`}
                    sub="mean Bayesian posterior"
                    tone={systemicScore > 0.5 ? "negative" : systemicScore > 0.3 ? "warning" : "positive"}
                />
                <StatTile
                    label="Global VaR 95% · 1d"
                    value={`${globalVar.current.var95.toFixed(2)}%`}
                    sub={`VaR 99% ${globalVar.current.var99.toFixed(2)}%`}
                    tone="warning"
                />
                <StatTile
                    label="CVaR 95% · 1d"
                    value={`${globalVar.current.cvar95.toFixed(2)}%`}
                    sub="expected shortfall"
                    tone="negative"
                />
                <StatTile
                    label="Regime"
                    value={regime.label.split(" ")[0]}
                    sub={`posterior ${(regime.posterior * 100).toFixed(0)}% · since ${regime.since}`}
                    tone="info"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Bayesian risk semaphores */}
                <Panel
                    title="Bayesian Risk Semaphores"
                    subtitle="P(risk | evidence) — 1-step Bayes update"
                    className="xl:col-span-2"
                    testId="bayesian-lights"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {bayesianLights.map((l) => (
                            <RiskLight
                                key={l.id}
                                label={l.label}
                                posterior={l.posterior}
                                prior={l.prior}
                                state={l.state}
                                testId={`risk-light-${l.id}`}
                            />
                        ))}
                    </div>
                </Panel>

                {/* Regime gauge */}
                <Panel
                    title="Topological Regime"
                    subtitle="structural-break probability"
                    testId="regime-gauge-panel"
                >
                    <div className="flex flex-col items-center">
                        <Gauge value={regime.gauge} label="Structural Break Risk" />
                        <div className="mt-4 w-full space-y-2">
                            {regime.transitions.map((t) => (
                                <div
                                    key={`${t.from}-${t.to}`}
                                    className="flex items-center justify-between text-[11px] font-mono"
                                >
                                    <span className="text-slate-500">
                                        {t.from} → {t.to}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-20 h-1.5 bg-[#1B2335]">
                                            <div
                                                className="h-full bg-[#4F8BFF]"
                                                style={{ width: `${t.prob * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-slate-300 w-9 text-right">
                                            {(t.prob * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Panel>
            </div>

            {/* Paper Trading desk — live IBKR demo feed + PaperBroker */}
            <div className="mt-6">
                <PaperTradingPanel />
            </div>

            {/* Global VaR time series */}
            <Panel
                title="Global VaR · Dynamic (from SDE ensemble)"
                subtitle="z-quantile parametric VaR/CVaR on aggregated stochastic volatility"
                className="mt-6"
                testId="global-var-chart"
            >
                <SafeChart ready={chartReady} resetKey={chartKey} minHeight={300}>
                <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={globalVar.series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                            <defs>
                                <linearGradient id="varFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PALETTE.danger} stopOpacity={0.25} />
                                    <stop offset="100%" stopColor={PALETTE.danger} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                            <XAxis dataKey="date" {...axisCommon} minTickGap={28} />
                            <YAxis {...axisCommon} tickFormatter={(v) => `${v}%`} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(3)}%`} />
                            <Area
                                type="monotone"
                                dataKey="cvar95"
                                name="CVaR 95%"
                                stroke={PALETTE.danger}
                                strokeWidth={1.5}
                                fill="url(#varFill)"
                                dot={false}
                            />
                            <Line type="monotone" dataKey="var95" name="VaR 95%" stroke={PALETTE.warn} strokeWidth={1.8} dot={false} />
                            <Line type="monotone" dataKey="var99" name="VaR 99%" stroke={PALETTE.blue} strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                </SafeChart>
            </Panel>

            {/* Model rooms grid */}
            <Panel
                title="Model Rooms · Health"
                subtitle="status of each computational module"
                className="mt-6"
                testId="modules-grid"
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {modules.map((m) => {
                        const meta = moduleMeta(m.id);
                        const health = m.health;
                        const tone = health > 0.85 ? PALETTE.positive : health > 0.65 ? PALETTE.warn : PALETTE.danger;
                        return (
                            <Link
                                key={m.id}
                                to={meta?.path || "/"}
                                className="group border border-[#1B2335] bg-[#0A0F1C] p-4 hover:border-[#2A3550] transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[12px] font-medium text-slate-200 truncate">
                                        {m.name}
                                    </span>
                                    <ArrowUpRight size={13} className="text-slate-600 group-hover:text-[#00E5C0] transition-colors shrink-0" />
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <StatusBadge status={m.status} />
                                    <span className="text-[11px] font-mono" style={{ color: tone }}>
                                        {(health * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="mt-2 h-1 bg-[#1B2335]">
                                    <div className="h-full" style={{ width: `${health * 100}%`, background: tone }} />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </Panel>
        </div>
    );
};

export default MasterDashboard;
