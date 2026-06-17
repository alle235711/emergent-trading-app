import React, { useMemo } from "react";
import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Area,
} from "recharts";

const ACCENT = "#00E5C0";
const DANGER = "#FF3B30";
const WARN = "#FF9F1C";

/** Rosso intenso = alta probabilità di violazione supporto */
function violationColor(p) {
    if (p === null || p === undefined) return "rgba(255,255,255,0.04)";
    const t = Math.max(0, Math.min(1, p));
    const alpha = 0.12 + t * 0.75;
    return `rgba(255,59,48,${alpha})`;
}

const axisCommon = {
    stroke: "#444",
    tick: { fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
    tickLine: { stroke: "#333" },
};

const tooltipStyle = {
    backgroundColor: "#0F0F0F",
    border: "1px solid #333",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
    color: "#fff",
};

/**
 * Panel D — Support violation heatmap + dynamic VaR/CVaR curves.
 *
 * @param {Object} result  — payload `result` da /api/forecast/ensemble-sde
 * @param {string} currency
 */
const EnsembleSdeRiskPanel = ({ result = null, currency = "" }) => {
    const supportViolation = result?.support_violation;
    const dynamicVar = result?.dynamic_var;
    const scenarios = result?.risk_scenarios;
    const pf = result?.particle_filter;

    const varChartData = useMemo(() => {
        if (!dynamicVar?.horizons) return [];
        return dynamicVar.horizons.map((h, i) => ({
            horizon: `${h}d`,
            horizonDays: h,
            var: dynamicVar.var?.[i] != null ? dynamicVar.var[i] * 100 : null,
            cvar: dynamicVar.cvar?.[i] != null ? dynamicVar.cvar[i] * 100 : null,
        }));
    }, [dynamicVar]);

    const levels = supportViolation?.levels || [];
    const probs = supportViolation?.probabilities || [];
    const horizons = supportViolation?.horizons || [];

    if (!result) {
        return (
            <div className="text-[11px] font-mono text-neutral-500 py-6">
                Ensemble SDE forecast non disponibile.
            </div>
        );
    }

    return (
        <div className="space-y-8" data-testid="ensemble-sde-risk-panel">
            {/* Scenari + PF summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ScenarioCard
                    label="Bear (q05)"
                    scenario={scenarios?.bear}
                    currency={currency}
                    tone="danger"
                />
                <ScenarioCard
                    label="Base (median)"
                    scenario={scenarios?.base}
                    currency={currency}
                    tone="neutral"
                />
                <ScenarioCard
                    label="Bull (q95)"
                    scenario={scenarios?.bull}
                    currency={currency}
                    tone="accent"
                />
                <div className="border border-[#222222] bg-[#050505] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">
                        PF — ESS
                    </div>
                    <div className="text-[#00E5C0] mt-0.5 font-mono text-sm">
                        {pf?.effective_sample_size != null
                            ? Number(pf.effective_sample_size).toFixed(1)
                            : "—"}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                        GBM {(pf?.model_weights?.gbm * 100 || 0).toFixed(0)}% · OU{" "}
                        {(pf?.model_weights?.ou * 100 || 0).toFixed(0)}% · Jump{" "}
                        {(pf?.model_weights?.jump * 100 || 0).toFixed(0)}%
                    </div>
                </div>
            </div>

            {/* Dynamic VaR / CVaR */}
            <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 mb-3">
                    // Dynamic VaR & CVaR (α = {(dynamicVar?.alpha ?? 0.05) * 100}%)
                </div>
                <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={varChartData}
                            margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
                        >
                            <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                            <XAxis dataKey="horizon" {...axisCommon} />
                            <YAxis
                                {...axisCommon}
                                tickFormatter={(v) => `${v.toFixed(1)}%`}
                                domain={[0, "auto"]}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                        <div style={tooltipStyle} className="px-3 py-2">
                                            <div className="text-neutral-500 text-[10px] uppercase tracking-widest mb-1">
                                                T = {label}
                                            </div>
                                            {payload.map((p) => (
                                                <div key={p.dataKey} className="text-[11px] mt-0.5">
                                                    <span style={{ color: p.color }}>{p.name}: </span>
                                                    <span className="text-white">
                                                        {Number(p.value).toFixed(2)}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }}
                            />
                            <Legend
                                wrapperStyle={{
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: 10,
                                    color: "#888",
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="cvar"
                                name="CVaR"
                                fill={DANGER}
                                fillOpacity={0.08}
                                stroke={DANGER}
                                strokeWidth={1.5}
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="var"
                                name="VaR"
                                stroke={WARN}
                                strokeWidth={2}
                                dot={{ r: 3, fill: WARN }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <p className="text-[10px] font-mono text-neutral-600 mt-2">
                    Perdita relativa L<sub>T</sub> = (S₀ − S<sub>T</sub>) / S₀ — quantili
                    empirici sull&apos;ensemble di traiettorie simulate.
                </p>
            </div>

            {/* Support violation heatmap */}
            <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 mb-3">
                    // Probabilità violazione supporti P(min<sub>τ≤T</sub> S<sub>τ</sub> &lt; S<sub>k</sub>)
                </div>
                {levels.length === 0 ? (
                    <div className="text-[11px] font-mono text-neutral-500 border border-[#222222] p-4">
                        Nessun livello di supporto disponibile per questo ticker.
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-[#222222]">
                        <table className="w-full text-[11px] font-mono">
                            <thead className="bg-[#050505] text-neutral-500">
                                <tr>
                                    <th className="px-3 py-2 text-left uppercase tracking-[0.2em]">
                                        Support
                                    </th>
                                    {horizons.map((h) => (
                                        <th
                                            key={h}
                                            className="px-2 py-2 text-center uppercase tracking-[0.15em]"
                                        >
                                            {h}d
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {levels.map((level, k) => {
                                    const row = probs[k] || [];
                                    const maxP = Math.max(...row.filter((x) => x != null), 0);
                                    return (
                                        <tr
                                            key={k}
                                            className="border-t border-[#1a1a1a] hover:bg-[#050505]"
                                        >
                                            <td className="px-3 py-2 text-right text-[#00E5C0]">
                                                {Number(level).toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                                {currency && (
                                                    <span className="text-neutral-600 ml-1 text-[9px]">
                                                        {currency}
                                                    </span>
                                                )}
                                                {maxP > 0.3 && (
                                                    <span className="ml-2 text-[#FF3B30] text-[9px]">
                                                        HIGH RISK
                                                    </span>
                                                )}
                                            </td>
                                            {row.map((p, j) => (
                                                <td
                                                    key={j}
                                                    className="text-center py-2 px-1"
                                                    style={{ background: violationColor(p) }}
                                                    title={
                                                        p != null
                                                            ? `P(violation)=${(p * 100).toFixed(1)}%`
                                                            : "n.d."
                                                    }
                                                >
                                                    {p != null ? (
                                                        <span className="text-white/90">
                                                            {(p * 100).toFixed(0)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral-700">—</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex items-center gap-4 mt-3 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-sm"
                            style={{ background: "rgba(255,59,48,0.7)" }}
                        />
                        <span>Alta violazione</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-white/5" />
                        <span>Bassa violazione</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ScenarioCard = ({ label, scenario, currency, tone = "neutral" }) => {
    const color =
        tone === "danger" ? DANGER : tone === "accent" ? ACCENT : "text-neutral-200";
    return (
        <div className="border border-[#222222] bg-[#050505] px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">
                {label}
            </div>
            <div className={`mt-0.5 font-mono text-sm ${tone !== "neutral" ? "" : "text-neutral-200"}`}
                style={tone !== "neutral" ? { color } : undefined}
            >
                {scenario?.price != null
                    ? Number(scenario.price).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })
                    : "—"}
                {currency && (
                    <span className="text-neutral-600 ml-1 text-[9px]">{currency}</span>
                )}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                {scenario?.return != null
                    ? `${(scenario.return * 100).toFixed(2)}% @ ${scenario.horizon}d`
                    : "—"}
            </div>
        </div>
    );
};

export default EnsembleSdeRiskPanel;
