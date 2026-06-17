import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle } from "lucide-react";

import { fetchMarketData, fetchSupportMatrix } from "../../lib/api";
import {
    formatAbsPercent,
    formatPercent,
    formatPrice,
    formatRatio,
} from "../../lib/format";
import { useTrading } from "../../context/TradingContext";
import TopologicalAnalysisView from './TopologicalAnalysisView';
import TickerSearch       from "./TickerSearch";
import PeriodSelector     from "./PeriodSelector";
import MetricCard         from "./MetricCard";
import PriceChart         from "./PriceChart";
import OrderTicket        from "./OrderTicket";
import SupportMatrixPanel from "./SupportMatrixPanel";

const DEFAULT_PERIOD = "2y";

const AnalysisView = ({
    defaultTicker,
    assetLabel = "ASSET",
    searchPlaceholder,
    quickTickers = [],
    testIdPrefix = "view",
}) => {
    const [ticker, setTicker]       = useState(defaultTicker);
    const [period, setPeriod]       = useState(DEFAULT_PERIOD);
    const [data, setData]           = useState(null);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [matrixData, setMatrixData] = useState(null);

    const { refreshLastPrice } = useTrading();

    // Converti periodo custom in parametri API comprensibili da yfinance
    const apiPeriod = period.startsWith("custom:") ? period : period;

    const loadData = useCallback(async (tk, prd) => {
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchMarketData(tk, prd);
            setData(payload);
        } catch (err) {
            const detail =
                err?.response?.data?.detail ||
                err?.message ||
                "Unknown error while fetching market data";
            setError(detail);
            setData(null);
            toast.error(`ERROR :: ${String(detail).toUpperCase()}`);
        } finally {
            setLoading(false);
        }
    }, []);

    // Carica dati mercato al cambio di periodo o ticker
    useEffect(() => {
        loadData(ticker, apiPeriod);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period]);

    // Carica matrice S/R dopo che i dati mercato sono disponibili
    useEffect(() => {
        if (!data?.ticker) return;

        // Periodi troppo corti non hanno abbastanza dati per S/R
        const skipSR = ["1d", "5d"].includes(period);
        if (skipSR) {
            setMatrixData(null);
            return;
        }

        fetchSupportMatrix(data.ticker, apiPeriod, {
            min_touches: 3,
            delta:       0.008,
            B:           500,
        })
            .then((res) => setMatrixData(res.result))
            .catch(() => setMatrixData(null));
    }, [data?.ticker, period]);

    useEffect(() => {
        if (data?.ticker && Number.isFinite(data?.last_price)) {
            refreshLastPrice(data.ticker, data.last_price);
        }
    }, [data, refreshLastPrice]);

    const handleSubmitTicker = useCallback(
        (newTicker) => {
            setTicker(newTicker);
            loadData(newTicker, apiPeriod);
        },
        [apiPeriod, loadData],
    );

    const priceChange = useMemo(() => {
        if (!data) return null;
        const { first_price, last_price } = data;
        if (!first_price) return null;
        return (last_price - first_price) / first_price;
    }, [data]);

    const returnTone  = (v) => (v >= 0 ? "positive" : "negative");
    const headerMeta  = data
        ? `${data.name || data.ticker}${data.currency ? ` · ${data.currency}` : ""}`
        : "—";

    // Costruisci srLevels per PriceChart
    const srLevels = useMemo(() => {
        if (!matrixData) return [];
        return matrixData.levels.map((price, i) => ({
            price,
            riskScore: matrixData.risk_score[i],
            strength:  matrixData.level_strength[i],
            nTouches:  matrixData.n_touches[i],
        }));
    }, [matrixData]);

    return (
        <div data-testid={`${testIdPrefix}-view`}>
            {/* Overline */}
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-3">
                // {assetLabel} Analysis
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight font-medium leading-tight">
                Historical volatility &{" "}
                <span className="text-[#00E5C0]">risk metrics</span>
            </h1>
            <p className="mt-4 text-sm sm:text-base text-neutral-400 max-w-2xl leading-relaxed">
                Daily close prices from Yahoo Finance. Annualized volatility is the
                standard deviation of log-returns scaled by √252. All figures are
                computed server-side using NumPy &amp; pandas.
            </p>

            {/* Controls */}
            <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mt-10 mb-6">
                <div className="flex-1 max-w-xl">
                    <TickerSearch
                        initialValue={ticker}
                        onSubmit={handleSubmitTicker}
                        disabled={loading}
                        placeholder={searchPlaceholder}
                    />
                    {quickTickers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-600 self-center">
                                Quick:
                            </span>
                            {quickTickers.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => handleSubmitTicker(t)}
                                    disabled={loading}
                                    data-testid={`${testIdPrefix}-quick-${t}`}
                                    className={[
                                        "text-[11px] font-mono tracking-[0.15em] px-2.5 py-1 border",
                                        ticker === t
                                            ? "border-[#00E5C0] text-[#00E5C0]"
                                            : "border-[#222222] text-neutral-400 hover:border-white/40 hover:text-white",
                                        "transition-colors duration-150 disabled:opacity-40",
                                    ].join(" ")}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <PeriodSelector
                    value={period}
                    onChange={(p) => setPeriod(p)}
                    disabled={loading}
                />
            </section>

            {/* Symbol meta */}
            <section
                className="border-t border-[#222222] py-4 mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2"
                data-testid={`${testIdPrefix}-symbol-meta`}
            >
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">Symbol</div>
                    <div className="text-lg font-mono mt-1" data-testid={`${testIdPrefix}-symbol-ticker`}>
                        {data?.ticker || ticker}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">Instrument</div>
                    <div className="text-sm font-mono mt-1 text-neutral-300 max-w-md truncate">{headerMeta}</div>
                </div>
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">Last Close</div>
                    <div className="text-lg font-mono mt-1" data-testid={`${testIdPrefix}-symbol-last-price`}>
                        {loading ? "…" : data ? formatPrice(data.last_price, data.currency) : "—"}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">Range</div>
                    <div className="text-sm font-mono mt-1 text-neutral-300">
                        {data ? `${data.start_date} → ${data.end_date}` : "—"}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">Period Change</div>
                    <div
                        className={`text-lg font-mono mt-1 ${
                            priceChange === null ? "text-neutral-300"
                            : priceChange >= 0   ? "text-[#00E5C0]"
                            : "text-[#FF3B30]"
                        }`}
                        data-testid={`${testIdPrefix}-symbol-period-change`}
                    >
                        {priceChange === null ? "—" : formatPercent(priceChange)}
                    </div>
                </div>
            </section>

            {/* Error banner */}
            {error && (
                <div
                    className="border border-[#FF3B30]/40 bg-[#FF3B30]/5 p-4 mb-6 flex items-start gap-3"
                    data-testid={`${testIdPrefix}-error-banner`}
                >
                    <AlertTriangle size={16} className="text-[#FF3B30] mt-0.5 shrink-0" strokeWidth={1.5} />
                    <div className="font-mono text-xs sm:text-sm text-[#FF3B30] leading-relaxed">
                        <span className="uppercase tracking-[0.2em]">err ::</span>{" "}
                        {String(error)}
                    </div>
                </div>
            )}

            {/* Metric grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <MetricCard
                    testId={`${testIdPrefix}-metric-volatility`}
                    label="Hist. Volatility (ann.)"
                    loading={loading}
                    value={data ? formatAbsPercent(data.metrics.volatility_annualized) : "—"}
                    sub={data ? `σ × √252 · n=${data.metrics.observations}` : ""}
                />
                <MetricCard
                    testId={`${testIdPrefix}-metric-return`}
                    label="Return (CAGR)"
                    loading={loading}
                    value={data ? formatPercent(data.metrics.return_annualized) : "—"}
                    sub="Compound annual growth"
                    tone={data ? returnTone(data.metrics.return_annualized) : "neutral"}
                />
                <MetricCard
                    testId={`${testIdPrefix}-metric-sharpe`}
                    label="Sharpe Ratio"
                    loading={loading}
                    value={data ? formatRatio(data.metrics.sharpe_ratio) : "—"}
                    sub={data ? `rf = ${formatAbsPercent(data.metrics.risk_free_rate)}` : ""}
                    tone={data ? (data.metrics.sharpe_ratio >= 0 ? "positive" : "negative") : "neutral"}
                />
                <MetricCard
                    testId={`${testIdPrefix}-metric-drawdown`}
                    label="Max Drawdown"
                    loading={loading}
                    value={data ? formatPercent(data.metrics.max_drawdown) : "—"}
                    sub="Peak → trough on close"
                    tone="negative"
                />
            </section>

            {/* Chart + Order ticket */}
            <section
                className="grid grid-cols-1 xl:grid-cols-3 gap-6"
                data-testid={`${testIdPrefix}-trading-grid`}
            >
                <div
                    className="border border-[#222222] bg-[#0F0F0F] p-4 sm:p-6 xl:col-span-2"
                    data-testid={`${testIdPrefix}-chart-panel`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                                Close Price Series
                            </div>
                            <div className="text-lg font-mono mt-1">
                                {data?.ticker || ticker}
                                <span className="text-neutral-500 ml-3 text-xs tracking-[0.2em]">
                                    {period.startsWith("custom:")
                                        ? (() => {
                                              const [, s, e] = period.split(":");
                                              return `${s} → ${e}`;
                                          })()
                                        : period.toUpperCase()}
                                </span>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                            <Activity size={12} strokeWidth={1.5} />
                            <span className="inline-block w-3 h-[2px] bg-[#00E5C0]" />
                            <span>Adj. Close</span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="h-[420px] flex items-center justify-center">
                            <div className="text-xs font-mono uppercase tracking-[0.3em] text-neutral-500 animate-pulse">
                                Loading series_
                            </div>
                        </div>
                    ) : data?.series?.length ? (
                        <PriceChart
                            series={data.series}
                            currency={data.currency}
                            firstPrice={data.first_price}
                            srLevels={srLevels}
                        />
                    ) : (
                        <div className="h-[420px] flex items-center justify-center text-xs font-mono uppercase tracking-[0.3em] text-neutral-500">
                            No data available
                        </div>
                    )}
                </div>

                <OrderTicket
                    ticker={data?.ticker || ticker}
                    currentPrice={data?.last_price}
                    currency={data?.currency}
                    testIdPrefix={testIdPrefix}
                />
            </section>

            {/* Support / Resistance Matrix */}
            {!loading && data && !["1d", "5d"].includes(period) && (
                <SupportMatrixPanel
                    ticker={data.ticker}
                    period={apiPeriod}
                    currency={data.currency}
                />
            )}
        </div>
    );
};

export default AnalysisView;