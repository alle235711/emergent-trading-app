import React, { useMemo } from "react";
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    ReferenceArea,
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

const FanTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    // Filter out the helper q05 series we use only to build the band
    const filtered = payload.filter(
        (p) => p.dataKey !== "_band_q05_offset" && p.value !== null && p.value !== undefined
    );
    return (
        <div style={tooltipStyle} className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                t = {label}
            </div>
            {filtered.map((p) => (
                <div key={p.dataKey} className="flex items-center gap-2 mt-1">
                    <span className="inline-block w-2 h-2" style={{ backgroundColor: p.color }} />
                    <span className="text-[11px] text-neutral-300">
                        {p.name}:{" "}
                        <span className="text-white">{Number(p.value).toFixed(2)}</span>
                    </span>
                </div>
            ))}
        </div>
    );
};

/**
 * GBM Fan Chart with regime overlay.
 *
 * - Renders the historical price series.
 * - Highlights bands where topology_series[i].regime === true (red bg).
 * - Appends a forecast cone: mean line + shaded q05/q95 band.
 *
 * @param {Array} topologySeries  [{t, price, regime, date?}, ...]
 * @param {Object} gbm           {mean:[], q05:[], q95:[]} — the forecast horizon
 */
const GbmFanChart = ({ topologySeries = [], gbm = null, height = 420 }) => {
    // Build combined data:
    // [{ t, price, mean, q05, q95, band: (q95-q05), _band_q05_offset: q05, regime }]
    const combined = useMemo(() => {
        const hist = topologySeries.map((p) => ({
            t: p.t,
            date: p.date || null,
            price: p.price,
            regime: !!p.regime,
            mean: null,
            q05: null,
            q95: null,
            band: null,
            _band_q05_offset: null,
        }));

        if (gbm && gbm.mean && gbm.mean.length > 0) {
            const lastT = hist.length > 0 ? hist[hist.length - 1].t : 0;
            const lastPrice = hist.length > 0 ? hist[hist.length - 1].price : null;

            // Anchor first forecast point at last historical price for a smooth cone
            if (lastPrice !== null) {
                hist[hist.length - 1] = {
                    ...hist[hist.length - 1],
                    mean: lastPrice,
                    q05: lastPrice,
                    q95: lastPrice,
                    band: 0,
                    _band_q05_offset: lastPrice,
                };
            }

            for (let h = 0; h < gbm.mean.length; h++) {
                const q05 = gbm.q05[h];
                const q95 = gbm.q95[h];
                hist.push({
                    t: lastT + h + 1,
                    date: null,
                    price: null,
                    regime: false,
                    mean: gbm.mean[h],
                    q05,
                    q95,
                    band: q95 - q05,
                    _band_q05_offset: q05,
                });
            }
        }
        return hist;
    }, [topologySeries, gbm]);

    // Build a list of contiguous regime windows for ReferenceArea overlays.
    const regimeBands = useMemo(() => {
        const bands = [];
        let start = null;
        for (let i = 0; i < topologySeries.length; i++) {
            const r = !!topologySeries[i].regime;
            if (r && start === null) start = topologySeries[i].t;
            if (!r && start !== null) {
                bands.push({ x1: start, x2: topologySeries[i - 1].t });
                start = null;
            }
        }
        if (start !== null) {
            bands.push({
                x1: start,
                x2: topologySeries[topologySeries.length - 1].t,
            });
        }
        return bands;
    }, [topologySeries]);

    const forecastStartT = useMemo(() => {
        return topologySeries.length > 0
            ? topologySeries[topologySeries.length - 1].t
            : null;
    }, [topologySeries]);

    return (
        <div className="w-full" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                    data={combined}
                    margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
                >
                    <defs>
                        <linearGradient id="gbmBand" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00E5C0" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#00E5C0" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                    <XAxis dataKey="t" {...axisCommon} />
                    <YAxis {...axisCommon} domain={["auto", "auto"]} />
                    <Tooltip content={<FanTooltip />} cursor={{ stroke: "#333" }} />

                    {/* Regime overlays */}
                    {regimeBands.map((b, idx) => (
                        <ReferenceArea
                            key={`regime-${idx}`}
                            x1={b.x1}
                            x2={b.x2}
                            y1={undefined}
                            y2={undefined}
                            strokeOpacity={0}
                            fill="#FF3B30"
                            fillOpacity={0.18}
                            ifOverflow="extendDomain"
                        />
                    ))}

                    {/* Forecast region marker */}
                    {forecastStartT !== null && gbm && (
                        <ReferenceArea
                            x1={forecastStartT}
                            x2={combined[combined.length - 1].t}
                            stroke="#333"
                            strokeDasharray="3 3"
                            fill="#00E5C0"
                            fillOpacity={0.02}
                        />
                    )}

                    {/* Stacked areas to form the q05—q95 cone:
                        invisible base = q05, then translucent band = (q95 - q05) */}
                    <Area
                        type="monotone"
                        dataKey="_band_q05_offset"
                        stackId="gbmcone"
                        stroke="none"
                        fill="transparent"
                        isAnimationActive={false}
                        legendType="none"
                    />
                    <Area
                        type="monotone"
                        dataKey="band"
                        stackId="gbmcone"
                        stroke="none"
                        fill="url(#gbmBand)"
                        fillOpacity={1}
                        name="GBM 90% CI"
                        isAnimationActive={false}
                    />

                    {/* Lines */}
                    <Line
                        type="monotone"
                        dataKey="price"
                        name="Price"
                        stroke="#FFFFFF"
                        strokeWidth={1.6}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="mean"
                        name="GBM mean"
                        stroke="#00E5C0"
                        strokeWidth={1.6}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="q05"
                        name="q05"
                        stroke="#00E5C0"
                        strokeOpacity={0.5}
                        strokeWidth={1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="q95"
                        name="q95"
                        stroke="#00E5C0"
                        strokeOpacity={0.5}
                        strokeWidth={1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export default GbmFanChart;
