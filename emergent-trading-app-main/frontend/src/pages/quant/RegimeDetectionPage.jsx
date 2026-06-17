import React from "react";

import {
    PageHeader,
    Panel,
    StatTile,
    Gauge,
    StatusBadge,
    RnDBanner,
    PALETTE,
} from "../../components/quant/shared/primitives";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { useHorizon } from "../../context/HorizonContext";
import { useDemoData } from "../../hooks/useDemoData";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";

/** Correlation colour: +1 teal, 0 navy, −1 red (diverging). */
function corrColor(rho) {
    if (rho >= 0) return `rgba(0,229,192,${0.1 + rho * 0.8})`;
    return `rgba(255,77,94,${0.1 + Math.abs(rho) * 0.8})`;
}

const regimeColor = (label) =>
    label === "Stress"
        ? PALETTE.danger
        : label === "Trending"
          ? PALETTE.accent
          : PALETTE.blue;

/**
 * Topological Regime Detection — Structural Changes — R&D mock.
 * TDA su matrici di correlazione multi-asset filtrate (Vietoris-Rips su
 * distanza 1−|ρ|) + classificatore Bayesiano per alert di regime. Heatmap di
 * correlazione classica + gauge per il cambio di regime strutturale.
 */
const RegimeDetectionPage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { data: state, dataSource, demoMode } = useDemoData(
        async () => {
            const { buildRegimeState } = await import("../../dev/mock/quantMock");
            return buildRegimeState(horizon, undefined, profile);
        },
        [horizon, profile, rangeToken],
    );

    if (!demoMode || !state) {
        return (
            <div data-testid="regime-detection-page">
                <PageHeader
                    kicker="Topology & PDE — R&D"
                    title="Topological Regime"
                    accent="Detection"
                    description="Nessun endpoint live. Abilita Demo Mode in Settings."
                    actions={<DataSourceBadge source="error" />}
                />
            </div>
        );
    }

    const { assets, corr, regimes, gauge, timeline, tda, classifier } = state;

    const dominant = [...regimes].sort((a, b) => b.posterior - a.posterior)[0];

    return (
        <div data-testid="regime-detection-page">
            <PageHeader
                kicker="R&D · Topological Regime"
                title="Regime"
                accent="Detection"
                description="Rilevamento di cambi strutturali via TDA su matrici di correlazione multi-asset, filtrate con un classificatore Bayesiano per l'alert di regime."
                actions={
                    <div className="flex items-center gap-2">
                        <DataSourceBadge source={dataSource} />
                        <StatusBadge status="mock" />
                        <AnalystGuidePanel model="regime" />
                    </div>
                }
            />

            <RnDBanner>
                Modulo in sviluppo — matrice di correlazione costruita PSD da fattori latenti e
                posterior di regime mockizzati. La pipeline TDA (persistence entropy +
                Wasserstein drift) + Naive Bayes verrà cablata su /api/regime/detect.
            </RnDBanner>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Dominant Regime" value={dominant.label.split(" ")[0]} sub={`posterior ${(dominant.posterior * 100).toFixed(0)}%`} tone="info" />
                <StatTile label="Regime Gauge" value={`${(gauge * 100).toFixed(0)}%`} sub="structural-break risk" tone={gauge > 0.6 ? "negative" : "warning"} />
                <StatTile label="Persistence Entropy" value={tda.persistence_entropy.toFixed(2)} sub="network complexity" tone="accent" />
                <StatTile label="Classifier Conf." value={`${(classifier.confidence * 100).toFixed(0)}%`} sub={classifier.model.split(" over ")[0]} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Correlation matrix */}
                <Panel
                    title="Multi-Asset Correlation Matrix"
                    subtitle="ρ(i,j) — input to the Vietoris-Rips filtration"
                    className="xl:col-span-2"
                    testId="corr-matrix"
                >
                    <div className="overflow-x-auto">
                        <table className="border-collapse font-mono text-[10px]">
                            <thead>
                                <tr>
                                    <th className="p-1.5" />
                                    {assets.map((a) => (
                                        <th key={a} className="p-1.5 text-slate-500 font-normal text-center min-w-[42px]">{a}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {assets.map((a, i) => (
                                    <tr key={a}>
                                        <td className="p-1.5 text-slate-500 text-right pr-2">{a}</td>
                                        {corr[i].map((rho, j) => (
                                            <td
                                                key={j}
                                                className="text-center p-1.5 min-w-[42px]"
                                                style={{ background: i === j ? "rgba(255,255,255,0.06)" : corrColor(rho) }}
                                                title={`ρ(${assets[i]}, ${assets[j]}) = ${rho.toFixed(2)}`}
                                            >
                                                <span className="text-white/85">{rho.toFixed(2)}</span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center gap-3 mt-5">
                        <span className="text-[9px] font-mono text-slate-600">ρ = −1</span>
                        <div className="flex-1 h-2 max-w-xs" style={{
                            background: `linear-gradient(90deg, ${corrColor(-1)}, ${corrColor(-0.3)}, rgba(255,255,255,0.06), ${corrColor(0.3)}, ${corrColor(1)})`,
                        }} />
                        <span className="text-[9px] font-mono text-slate-600">ρ = +1</span>
                    </div>
                </Panel>

                {/* Regime gauge + posteriors */}
                <Panel title="Structural Break Gauge" subtitle="Bayesian regime classifier" testId="regime-gauge">
                    <div className="flex flex-col items-center">
                        <Gauge value={gauge} label="Regime change" />
                    </div>
                    <div className="mt-4 space-y-2">
                        {regimes.map((r) => (
                            <div key={r.label} className="text-[11px] font-mono">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-slate-400">{r.label}</span>
                                    <span className="text-slate-200">{(r.posterior * 100).toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-[#1B2335]">
                                    <div className="h-full" style={{ width: `${r.posterior * 100}%`, background: r.label.includes("Break") ? PALETTE.danger : r.label.includes("Stress") ? PALETTE.warn : PALETTE.accent }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    {classifier.alert && (
                        <div className="mt-4 border border-[#FF4D5E]/40 bg-[#FF4D5E]/[0.06] px-3 py-2 text-[10px] font-mono text-[#FF4D5E] uppercase tracking-[0.2em]">
                            ⚠ Regime-change alert active
                        </div>
                    )}
                </Panel>
            </div>

            {/* Regime timeline */}
            <Panel
                title="Regime Timeline"
                subtitle="last 30 sessions · TDA-filtered classification"
                className="mt-6"
                testId="regime-timeline"
            >
                <div className="flex items-end gap-[3px] h-24">
                    {timeline.map((d) => (
                        <div
                            key={d.t}
                            className="flex-1 transition-all hover:opacity-80"
                            style={{
                                height: `${20 + d.score * 80}%`,
                                background: regimeColor(d.regime),
                                opacity: 0.5 + d.score * 0.5,
                            }}
                            title={`${d.date} · ${d.regime} · score ${d.score}`}
                        />
                    ))}
                </div>
                <div className="flex items-center gap-6 mt-4 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                    <span className="flex items-center gap-2"><span className="w-3 h-3" style={{ background: PALETTE.accent }} /> Trending</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3" style={{ background: PALETTE.blue }} /> Range</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3" style={{ background: PALETTE.danger }} /> Stress</span>
                    <span className="ml-auto text-slate-600">
                        {tda.filtration} · drift {tda.wasserstein_drift}
                    </span>
                </div>
            </Panel>
        </div>
    );
};

export default RegimeDetectionPage;
