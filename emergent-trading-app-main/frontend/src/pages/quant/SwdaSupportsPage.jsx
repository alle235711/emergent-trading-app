import React, { useEffect, useMemo, useState } from "react";
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from "recharts";

import {
    PageHeader,
    Panel,
    StatTile,
    Legend,
    PALETTE,
} from "../../components/quant/shared/primitives";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { useMarketData } from "../../context/MarketDataContext";
import { fetchMarketOhlc } from "../../lib/api";
import { horizonToPeriod, toYahooSymbol } from "../../lib/tickerSymbol";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";

const UP = PALETTE.accent;
const DOWN = PALETTE.danger;

const axisCommon = {
    stroke: "#2A3550",
    tick: { fill: "#64748B", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
    tickLine: { stroke: "#1B2335" },
};

const Candle = (props) => {
    const { x, y, width, height, payload } = props;
    const { open, close, high, low } = payload;
    if (high === low) return null;
    const pxForPrice = (p) => y + ((high - p) / (high - low)) * height;
    const isUp = close >= open;
    const color = isUp ? UP : DOWN;
    const bodyTop = pxForPrice(Math.max(open, close));
    const bodyBottom = pxForPrice(Math.min(open, close));
    const bodyH = Math.max(1, bodyBottom - bodyTop);
    const cx = x + width / 2;
    const bodyW = Math.max(2, width * 0.62);
    return (
        <g>
            <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1} />
            <rect
                x={cx - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={isUp ? "transparent" : color}
                stroke={color}
                strokeWidth={1}
            />
        </g>
    );
};

const CandleTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div className="font-mono text-[11px] px-3 py-2 bg-[#0A0F1C] border border-[#2A3550]">
            <div className="text-slate-500 text-[10px] uppercase tracking-[0.2em] mb-1">{d.date}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-300">
                <span>O {d.open.toFixed(2)}</span>
                <span>H {d.high.toFixed(2)}</span>
                <span>L {d.low.toFixed(2)}</span>
                <span className={d.close >= d.open ? "text-[#00E5C0]" : "text-[#FF4D5E]"}>
                    C {d.close.toFixed(2)}
                </span>
            </div>
        </div>
    );
};

/** Extract S/R levels from real OHLC via pivot clustering. */
function extractLevels(candles, refPrice) {
    if (!candles?.length || !refPrice) return [];
    const band = refPrice * 0.012;
    const pivots = [];

    for (let i = 2; i < candles.length - 2; i++) {
        const c = candles[i];
        const isLow =
            c.low <= candles[i - 1].low &&
            c.low <= candles[i - 2].low &&
            c.low <= candles[i + 1].low &&
            c.low <= candles[i + 2].low;
        const isHigh =
            c.high >= candles[i - 1].high &&
            c.high >= candles[i - 2].high &&
            c.high >= candles[i + 1].high &&
            c.high >= candles[i + 2].high;
        if (isLow) pivots.push(c.low);
        if (isHigh) pivots.push(c.high);
    }

    const clusters = [];
    pivots.sort((a, b) => a - b).forEach((p) => {
        const hit = clusters.find((cl) => Math.abs(cl.price - p) <= band);
        if (hit) {
            hit.touches += 1;
            hit.price = (hit.price * (hit.touches - 1) + p) / hit.touches;
        } else {
            clusters.push({ price: p, touches: 1 });
        }
    });

    return clusters
        .filter((cl) => cl.touches >= 3)
        .map((cl) => ({
            price: Number(cl.price.toFixed(2)),
            type: cl.price <= refPrice ? "support" : "resistance",
            touches: cl.touches,
            strength: Math.min(1, cl.touches / 12),
            confidence: Math.min(0.95, 0.5 + cl.touches / 20),
        }))
        .sort((a, b) => b.price - a.price)
        .slice(0, 8);
}

/**
 * SWDA Historical Supports — wired to Yahoo OHLCV + live hybrid quote.
 */
const SwdaSupportsPage = () => {
    const { horizon, rangeToken } = useHorizon();
    const { ticker, symbol } = useTicker();
    const { lastPrice, status: feedStatus, source, ibkrConnected } = useMarketData();
    const yahoo = toYahooSymbol(symbol);
    const period = horizonToPeriod(horizon);

    const [ohlc, setOhlc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchMarketOhlc(yahoo, period)
            .then((res) => {
                if (!cancelled) setOhlc(res);
            })
            .catch((e) => {
                if (!cancelled) setError(e?.message || "fetch failed");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [yahoo, period]);

    const candles = useMemo(() => {
        if (!ohlc?.candles?.length) return [];
        return ohlc.candles.map((c) => ({
            date: c.date?.slice(0, 10) ?? c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
        }));
    }, [ohlc]);

    const displayPrice = lastPrice ?? ohlc?.last_price ?? candles.at(-1)?.close ?? null;
    const currency = ohlc?.currency || "EUR";

    const levels = useMemo(
        () => extractLevels(candles, displayPrice),
        [candles, displayPrice],
    );

    const chartData = useMemo(
        () => candles.map((c) => ({ ...c, hl: [c.low, c.high] })),
        [candles],
    );

    const yDomain = useMemo(() => {
        if (!candles.length) return [0, 1];
        const lows = candles.map((c) => c.low);
        const highs = candles.map((c) => c.high);
        const lo = Math.min(...lows, ...levels.map((l) => l.price), displayPrice || Infinity);
        const hi = Math.max(...highs, ...levels.map((l) => l.price), displayPrice || 0);
        const pad = (hi - lo) * 0.04;
        return [Number((lo - pad).toFixed(1)), Number((hi + pad).toFixed(1))];
    }, [candles, levels, displayPrice]);

    const supports = levels.filter((l) => l.type === "support");
    const resistances = levels.filter((l) => l.type === "resistance");

    return (
        <div data-testid="swda-supports-page">
            <PageHeader
                kicker="Operational · ETF / Equity · LIVE"
                title={`${symbol} Historical`}
                accent="Supports"
                description={`Analisi di ${yahoo}: OHLCV da Yahoo Finance e ultimo prezzo dal feed ibrido ${ibkrConnected ? "IBKR paper" : "Yahoo fallback"} (${source || feedStatus}).`}
                actions={<AnalystGuidePanel model="swda" />}
            />

            {error ? (
                <div className="mb-4 text-[11px] font-mono text-[#FF4D5E] border border-[#FF4D5E]/30 px-3 py-2">
                    Errore caricamento dati: {error}
                </div>
            ) : null}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Ticker" value={yahoo} sub={ticker.name} tone="accent" />
                <StatTile
                    label="Last Price"
                    value={displayPrice != null ? displayPrice.toFixed(2) : "—"}
                    sub={`${currency} · ${source || feedStatus}`}
                    tone="positive"
                />
                <StatTile label="Support Levels" value={supports.length} sub="below price" tone="positive" />
                <StatTile label="Resistance Levels" value={resistances.length} sub="above price" tone="warning" />
            </div>

            <Panel
                title="Candlestick · Support / Resistance"
                subtitle={loading ? "caricamento Yahoo Finance…" : `Yahoo · period=${period} · ${candles.length} barre`}
                testId="candlestick"
            >
                <div style={{ height: 440 }}>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 8, right: 56, bottom: 4, left: 0 }}>
                                <CartesianGrid stroke="#141B2A" strokeDasharray="3 3" />
                                <XAxis dataKey="date" {...axisCommon} minTickGap={40} />
                                <YAxis {...axisCommon} domain={yDomain} width={52} />
                                <Tooltip content={<CandleTooltip />} cursor={{ stroke: "#2A3550" }} />
                                <Bar dataKey="hl" shape={<Candle />} isAnimationActive={false} />
                                {displayPrice != null ? (
                                    <ReferenceLine
                                        y={displayPrice}
                                        stroke="#00E5C0"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `LIVE ${displayPrice.toFixed(2)}`,
                                            position: "right",
                                            fill: "#00E5C0",
                                            fontSize: 9,
                                            fontFamily: "JetBrains Mono, monospace",
                                        }}
                                    />
                                ) : null}
                                {levels.map((l) => (
                                    <ReferenceLine
                                        key={`${l.type}-${l.price}`}
                                        y={l.price}
                                        stroke={l.type === "support" ? UP : PALETTE.warn}
                                        strokeDasharray="5 4"
                                        strokeOpacity={0.5 + l.strength * 0.5}
                                        label={{
                                            value: `${l.type === "support" ? "S" : "R"} ${l.price.toFixed(1)} · ${l.touches}×`,
                                            position: "right",
                                            fill: l.type === "support" ? UP : PALETTE.warn,
                                            fontSize: 9,
                                            fontFamily: "JetBrains Mono, monospace",
                                        }}
                                    />
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-[11px] font-mono text-slate-600">
                            {loading ? "Caricamento storico OHLCV…" : "Nessun dato disponibile"}
                        </div>
                    )}
                </div>
                <div className="mt-4">
                    <Legend
                        items={[
                            { label: "Bullish candle", color: UP },
                            { label: "Bearish candle", color: DOWN },
                            { label: "Support", color: UP },
                            { label: "Resistance", color: PALETTE.warn },
                            { label: "Live price", color: "#00E5C0" },
                        ]}
                    />
                </div>
            </Panel>

            <Panel
                title="Base Probability Matrix · S/R levels"
                subtitle="livelli estratti da pivot reali sull'OHLCV Yahoo"
                className="mt-6"
                testId="base-prob-matrix"
            >
                <div className="overflow-x-auto">
                    <table className="w-full font-mono text-[11px]">
                        <thead>
                            <tr className="text-slate-500 uppercase tracking-[0.2em] text-[10px]">
                                <th className="text-left pb-3 pr-4 font-normal">Level</th>
                                <th className="text-left pb-3 pr-4 font-normal">Type</th>
                                <th className="text-center pb-3 px-3 font-normal">Touches</th>
                                <th className="text-center pb-3 px-3 font-normal">Strength</th>
                                <th className="text-center pb-3 px-3 font-normal">P(hold)</th>
                                <th className="text-center pb-3 px-3 font-normal">Confidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {levels.map((l) => {
                                const pHold = Math.min(0.97, 0.45 + l.strength * 0.5);
                                const c = l.type === "support" ? UP : PALETTE.warn;
                                return (
                                    <tr key={`${l.type}-${l.price}`} className="border-t border-[#1B2335] hover:bg-white/[0.02]">
                                        <td className="py-2.5 pr-4" style={{ color: c }}>
                                            {l.price.toFixed(2)} <span className="text-slate-600">{currency}</span>
                                        </td>
                                        <td className="py-2.5 pr-4 text-slate-400 uppercase">{l.type}</td>
                                        <td className="py-2.5 px-3 text-center text-slate-300">{l.touches}</td>
                                        <td className="py-2.5 px-3">
                                            <div className="flex items-center gap-2 justify-center">
                                                <div className="w-16 h-1.5 bg-[#1B2335]">
                                                    <div className="h-full" style={{ width: `${l.strength * 100}%`, background: c }} />
                                                </div>
                                                <span className="text-slate-400 w-8 text-right">{(l.strength * 100).toFixed(0)}</span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 text-center text-slate-200">{(pHold * 100).toFixed(0)}%</td>
                                        <td className="py-2.5 px-3 text-center text-slate-400">{(l.confidence * 100).toFixed(0)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
};

export default SwdaSupportsPage;
