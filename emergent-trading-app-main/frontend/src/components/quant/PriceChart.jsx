import React, { useMemo, useState } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    Label,
} from "recharts";

const ACCENT = "#00E5C0";
const GRID   = "#1A1A1A";
const AXIS   = "#444444";

function srColor(riskScore, strength = 1) {
    const t     = Math.max(0, Math.min(1, riskScore || 0));
    const r     = Math.round(t * 255);
    const g     = Math.round((1 - t) * 180);
    const b     = Math.round((1 - t) * 100);
    const alpha = 0.35 + (strength || 0) * 0.5;
    return `rgba(${r},${g},${b},${alpha})`;
}

const TerminalTooltip = ({ active, payload, label, currency, levels }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;

    const nearest = levels?.length
        ? levels.reduce((best, cur) =>
              Math.abs(cur.price - v) < Math.abs(best.price - v) ? cur : best
          )
        : null;
    const distPct = nearest
        ? (((v - nearest.price) / nearest.price) * 100).toFixed(2)
        : null;

    return (
        <div
            className="font-mono text-xs px-3 py-2"
            style={{
                background: "rgba(10,10,10,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                pointerEvents: "none",
            }}
            data-testid="chart-tooltip"
        >
            <div className="text-neutral-500 uppercase tracking-[0.2em] text-[10px] mb-1">
                {label}
            </div>
            <div className="text-[#00E5C0]">
                {Number(v).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
                {currency && (
                    <span className="text-neutral-500 ml-2">{currency}</span>
                )}
            </div>
            {nearest && distPct !== null && (
                <div className="text-neutral-500 text-[10px] mt-1.5 border-t border-white/5 pt-1.5">
                    S/R:{" "}
                    <span style={{ color: srColor(nearest.riskScore, nearest.strength) }}>
                        {Number(nearest.price).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                    <span className="ml-2 text-neutral-600">
                        {distPct > 0 ? "+" : ""}{distPct}%
                    </span>
                </div>
            )}
        </div>
    );
};

export const PriceChart = ({
    series     = [],
    currency,
    firstPrice,
    srLevels   = [],
}) => {
    const [showSR, setShowSR] = useState(true);

    const { data, yDomain, ticks } = useMemo(() => {
        if (!series.length)
            return { data: [], yDomain: ["auto", "auto"], ticks: [] };

        const values    = series.map((p) => p.close);
        const srPrices  = srLevels.map((l) => l.price);
        const allValues = [...values, ...srPrices];

        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        const pad = (max - min) * 0.08 || max * 0.02;

        const step = Math.max(1, Math.floor(series.length / 6));
        const tks  = series
            .filter((_, i) => i % step === 0)
            .map((p) => p.date);

        return {
            data:   series,
            yDomain: [min - pad, max + pad],
            ticks:   tks,
        };
    }, [series, srLevels]);

    const visibleLevels = useMemo(() => {
        if (!showSR || !srLevels.length) return [];
        const [lo, hi] = yDomain;
        return srLevels.filter(
            (l) => l.price >= lo && l.price <= hi && l.nTouches > 0
        );
    }, [srLevels, yDomain, showSR]);

    return (
        <div className="w-full" data-testid="price-chart">
            {/* Toggle S/R */}
            {srLevels.length > 0 && (
                <div className="flex items-center justify-end gap-4 mb-3">
                    <div className="flex items-center gap-3 text-[10px] font-mono text-neutral-600">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-4 h-[2px] bg-[#00B490]" />
                            rimbalzo
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-4 h-[2px] bg-[#FF3B30]" />
                            rottura
                        </span>
                    </div>
                    <button
                        onClick={() => setShowSR((v) => !v)}
                        className={[
                            "text-[10px] font-mono uppercase tracking-[0.2em] px-2.5 py-1 border transition-colors",
                            showSR
                                ? "border-[#00E5C0]/50 text-[#00E5C0]"
                                : "border-[#222] text-neutral-600 hover:border-white/20",
                        ].join(" ")}
                    >
                        S/R {showSR ? "ON" : "OFF"}
                    </button>
                </div>
            )}

            {/* Altezza fissa sul wrapper, NON su ResponsiveContainer */}
            <div style={{ width: "100%", height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={series}
                        margin={{ top: 16, right: 48, left: 0, bottom: 8 }}
                    >
                        <CartesianGrid
                            stroke={GRID}
                            strokeDasharray="3 3"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="date"
                            ticks={ticks}
                            tickFormatter={(d) => {
                                const [y, m] = d.split("-");
                                const dt = new Date(
                                    parseInt(y, 10),
                                    parseInt(m, 10) - 1
                                );
                                return dt
                                    .toLocaleDateString("en-US", {
                                        month: "short",
                                        year:  "2-digit",
                                    })
                                    .toUpperCase();
                            }}
                            stroke={AXIS}
                            tick={{ fill: "#666", fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: GRID }}
                            minTickGap={20}
                        />
                        <YAxis
                            domain={yDomain}
                            stroke={AXIS}
                            tick={{ fill: "#666", fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={72}
                            tickFormatter={(v) =>
                                Number(v).toLocaleString("en-US", {
                                    maximumFractionDigits: 2,
                                })
                            }
                        />
                        <Tooltip
                            content={
                                <TerminalTooltip
                                    currency={currency}
                                    levels={visibleLevels}
                                />
                            }
                            cursor={{
                                stroke:          "#444",
                                strokeWidth:     1,
                                strokeDasharray: "4 3",
                            }}
                            isAnimationActive={false}
                        />

                        {firstPrice && (
                            <ReferenceLine
                                y={firstPrice}
                                stroke="#2a2a2a"
                                strokeDasharray="2 4"
                            />
                        )}

                        {visibleLevels.map((lvl, i) => (
                            <ReferenceLine
                                key={`sr-${i}`}
                                y={lvl.price}
                                stroke={srColor(lvl.riskScore, lvl.strength)}
                                strokeWidth={
                                    lvl.strength > 0.7 ? 1.5 :
                                    lvl.strength > 0.4 ? 1.0 : 0.7
                                }
                                strokeDasharray={
                                    lvl.riskScore > 0.6 ? "none" : "4 3"
                                }
                                ifOverflow="extendDomain"
                            >
                                <Label
                                    value={Number(lvl.price).toLocaleString(
                                        "en-US",
                                        { maximumFractionDigits: 2 }
                                    )}
                                    position="insideRight"
                                    offset={4}
                                    style={{
                                        fontSize:   9,
                                        fontFamily: "monospace",
                                        fill:       srColor(lvl.riskScore, lvl.strength),
                                        opacity:    0.85,
                                    }}
                                />
                            </ReferenceLine>
                        ))}

                        <Line
                            type="monotone"
                            dataKey="close"
                            stroke={ACCENT}
                            strokeWidth={1.6}
                            dot={false}
                            activeDot={{
                                r:           4,
                                fill:        ACCENT,
                                stroke:      "#000",
                                strokeWidth: 2,
                            }}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default PriceChart;