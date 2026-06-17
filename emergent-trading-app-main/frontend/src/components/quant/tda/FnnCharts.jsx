import React from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    ReferenceLine,
    Label,
} from "recharts";

const tooltipStyle = {
    backgroundColor: "#0F0F0F",
    border: "1px solid #333",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
    color: "#fff",
};

const axisCommon = {
    stroke: "#444",
    tick: { fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
    tickLine: { stroke: "#333" },
};

const FnnTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div style={tooltipStyle} className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                d = {label}
            </div>
            {payload.map((p) => (
                <div key={p.dataKey} className="flex items-center gap-2 mt-1">
                    <span
                        className="inline-block w-2 h-2"
                        style={{ backgroundColor: p.color }}
                    />
                    <span className="text-[11px] text-neutral-300">
                        {p.name}:{" "}
                        <span className="text-white">
                            {p.value === null || p.value === undefined
                                ? "—"
                                : Number(p.value).toFixed(4)}
                        </span>
                    </span>
                </div>
            ))}
        </div>
    );
};

/**
 * Two side-by-side charts:
 *   1. fnn_pct vs d (Kennel) — should decrease
 *   2. E* vs d (Cao)         — should converge to 1
 *
 * @param {Array<{d:number, fnn_pct:number}>} chartFnn
 * @param {Array<{d:number, E1:number|null, Estar:number|null}>} chartCao
 * @param {number} dRecommended
 */
const FnnCharts = ({ chartFnn = [], chartCao = [], dRecommended }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kennel: FNN % */}
            <div className="border border-[#222222] bg-[#0F0F0F] p-4">
                <div className="flex items-baseline justify-between mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                        // FNN % — Kennel criterion
                    </div>
                    <div className="text-[10px] font-mono text-neutral-600">
                        ↓ → 0
                    </div>
                </div>
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartFnn}
                            margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
                        >
                            <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                            <XAxis
                                dataKey="d"
                                {...axisCommon}
                                label={{
                                    value: "Embedding dimension d",
                                    position: "insideBottom",
                                    offset: -8,
                                    fill: "#666",
                                    fontSize: 10,
                                    fontFamily: "JetBrains Mono, monospace",
                                }}
                            />
                            <YAxis
                                {...axisCommon}
                                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                            />
                            <Tooltip
                                content={<FnnTooltip />}
                                cursor={{ stroke: "#333", strokeDasharray: "3 3" }}
                            />
                            <Line
                                type="monotone"
                                dataKey="fnn_pct"
                                name="FNN %"
                                stroke="#00E5C0"
                                strokeWidth={1.8}
                                dot={{ r: 3, fill: "#00E5C0", stroke: "#0F0F0F", strokeWidth: 1 }}
                                activeDot={{ r: 5 }}
                                isAnimationActive
                            />
                            {dRecommended && (
                                <ReferenceLine
                                    x={dRecommended}
                                    stroke="#FF9F1C"
                                    strokeDasharray="4 4"
                                    strokeWidth={1}
                                >
                                    <Label
                                        value={`d* = ${dRecommended}`}
                                        position="top"
                                        fill="#FF9F1C"
                                        fontSize={10}
                                        fontFamily="JetBrains Mono, monospace"
                                    />
                                </ReferenceLine>
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Cao: E* */}
            <div className="border border-[#222222] bg-[#0F0F0F] p-4">
                <div className="flex items-baseline justify-between mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                        // E*(d) — Cao criterion
                    </div>
                    <div className="text-[10px] font-mono text-neutral-600">
                        → 1.0
                    </div>
                </div>
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartCao}
                            margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
                        >
                            <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                            <XAxis
                                dataKey="d"
                                {...axisCommon}
                                label={{
                                    value: "Embedding dimension d",
                                    position: "insideBottom",
                                    offset: -8,
                                    fill: "#666",
                                    fontSize: 10,
                                    fontFamily: "JetBrains Mono, monospace",
                                }}
                            />
                            <YAxis
                                {...axisCommon}
                                domain={[0, "auto"]}
                            />
                            <Tooltip
                                content={<FnnTooltip />}
                                cursor={{ stroke: "#333", strokeDasharray: "3 3" }}
                            />
                            <ReferenceLine
                                y={1}
                                stroke="#444"
                                strokeDasharray="2 2"
                            />
                            <Line
                                type="monotone"
                                dataKey="E1"
                                name="E1"
                                stroke="#6B7280"
                                strokeWidth={1.4}
                                dot={{ r: 2, fill: "#6B7280" }}
                                connectNulls
                            />
                            <Line
                                type="monotone"
                                dataKey="Estar"
                                name="E*"
                                stroke="#A78BFA"
                                strokeWidth={1.8}
                                dot={{ r: 3, fill: "#A78BFA", stroke: "#0F0F0F", strokeWidth: 1 }}
                                connectNulls
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default FnnCharts;
