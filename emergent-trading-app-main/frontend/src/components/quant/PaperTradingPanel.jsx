/**
 * PaperTradingPanel.jsx — Part 2
 * ────────────────────────────────────────────────────────────────────────────
 * Live paper-trading desk. Streams the LIVE price for the GLOBAL ticker from the
 * hybrid WebSocket feed (Part 1, IBKRPaperStream) and routes Buy/Sell orders to
 * the backend PaperBroker (/api/execute). The portfolio table marks unrealised
 * P&L against the same live feed and re-syncs after every fill + on a poll.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, RotateCcw, Activity, Wifi, WifiOff } from "lucide-react";

import { Panel, PALETTE } from "./shared/primitives";
import { useTicker } from "../../context/TickerContext";
import { useMarketData } from "../../context/MarketDataContext";
import {
    executePaperOrder,
    getPaperPortfolio,
    resetPaperPortfolio,
} from "../../lib/api";

const fmtMoney = (v, ccy = "EUR") =>
    v === null || v === undefined || Number.isNaN(v)
        ? "—"
        : new Intl.NumberFormat("it-IT", {
              style: "currency",
              currency: ccy || "EUR",
              maximumFractionDigits: 2,
          }).format(v);

const fmtNum = (v, d = 4) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d);

const pnlColor = (v) => (v > 0 ? PALETTE.positive : v < 0 ? PALETTE.danger : PALETTE.muted);

const PaperTradingPanel = () => {
    const { symbol } = useTicker();
    const {
        status,
        tick,
        lastPrice: last,
        source,
        ibkrConnected,
        brokerDisconnected,
        priceDelayed,
        delayNote,
    } = useMarketData();

    const [quantity, setQuantity] = useState("1");
    const [orderType, setOrderType] = useState("market");
    const [limitPrice, setLimitPrice] = useState("");
    const [portfolio, setPortfolio] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const pollRef = useRef(null);

    const refreshPortfolio = useCallback(async () => {
        try {
            const res = await getPaperPortfolio();
            setPortfolio(res.portfolio);
        } catch {
            /* backend offline — leave last snapshot */
        }
    }, []);

    useEffect(() => {
        refreshPortfolio();
        pollRef.current = setInterval(refreshPortfolio, 5000);
        return () => clearInterval(pollRef.current);
    }, [refreshPortfolio]);

    const qtyNum = Number(quantity);
    const refPrice = orderType === "market" ? last : Number(limitPrice) || last;
    const estCost =
        Number.isFinite(qtyNum) && Number.isFinite(refPrice) ? qtyNum * refPrice : null;

    const submit = useCallback(
        async (side) => {
            if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
                toast.error("ERR :: QUANTITÀ NON VALIDA");
                return;
            }
            setSubmitting(true);
            try {
                const res = await executePaperOrder({
                    ticker: symbol,
                    side,
                    quantity: qtyNum,
                    order_type: orderType,
                    limit_price: orderType === "market" ? null : Number(limitPrice) || null,
                });
                setPortfolio(res.portfolio);
                toast.success(
                    `PAPER :: ${side.toUpperCase()} ${symbol} × ${qtyNum} @ ${fmtNum(res.live_price)}`,
                );
            } catch (e) {
                const msg = e?.response?.data?.detail || e?.message || "errore esecuzione";
                toast.error(`ERR :: ${String(msg).toUpperCase()}`);
            } finally {
                setSubmitting(false);
            }
        },
        [symbol, qtyNum, orderType, limitPrice],
    );

    const onReset = useCallback(async () => {
        try {
            const res = await resetPaperPortfolio();
            setPortfolio(res.portfolio);
            toast.success("PAPER :: PORTAFOGLIO RESET");
        } catch {
            toast.error("ERR :: RESET FALLITO");
        }
    }, []);

    const ccy = portfolio?.currency || "EUR";
    const changePct = tick?.change_pct;

    const statusPill = useMemo(() => {
        if (brokerDisconnected) {
            return { c: PALETTE.warn, label: "YAHOO DELAYED", Icon: WifiOff };
        }
        const map = {
            live: { c: PALETTE.positive, label: "LIVE", Icon: Wifi },
            connecting: { c: PALETTE.warn, label: "CONNECTING", Icon: Activity },
            closed: { c: PALETTE.muted, label: "OFFLINE", Icon: WifiOff },
            error: { c: PALETTE.danger, label: "ERROR", Icon: WifiOff },
        };
        return map[status] || map.connecting;
    }, [status, brokerDisconnected]);

    const StatusIcon = statusPill.Icon;

    return (
        <>
            {brokerDisconnected && (
                <div
                    className="mb-4 px-4 py-3 border border-[#FFB020]/50 bg-[#FFB020]/[0.08] text-[11px] font-mono text-[#FFB020] leading-relaxed"
                    data-testid="paper-broker-disconnected-banner"
                >
                    ⚠️ Broker disconnected — using Yahoo Finance delayed prices (15–20 min).
                    Not suitable for real execution.
                </div>
            )}
        <Panel
            title="Paper Trading Desk"
            subtitle={`${ibkrConnected ? "IBKR paper live" : "Yahoo delayed only"} · /api/execute · ${symbol}`}
            testId="paper-trading-panel"
            badge={
                <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.2em] border"
                    style={{ color: statusPill.c, borderColor: `${statusPill.c}55`, background: `${statusPill.c}12` }}
                    data-testid="paper-stream-status"
                >
                    <StatusIcon size={11} strokeWidth={1.8} />
                    {statusPill.label}
                </span>
            }
        >
            {/* Live quote header */}
            <div className="flex items-end justify-between gap-4 mb-5 pb-5 border-b border-[#1B2335]">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">
                        {symbol} · last
                    </div>
                    <div
                        className="mt-1 text-3xl font-mono font-medium tracking-tight tabular-nums"
                        style={{ color: changePct >= 0 ? PALETTE.positive : PALETTE.danger }}
                        data-testid="paper-live-price"
                    >
                        {fmtNum(last, 4)}
                    </div>
                    {tick ? (
                        <div className="mt-1 text-[11px] font-mono text-slate-500 tabular-nums">
                            bid {fmtNum(tick.bid, 4)} · ask {fmtNum(tick.ask, 4)}
                            <span style={{ color: changePct >= 0 ? PALETTE.positive : PALETTE.danger }} className="ml-2">
                                {changePct >= 0 ? "+" : ""}
                                {fmtNum(changePct, 2)}%
                            </span>
                            <span
                                className="ml-2 uppercase tracking-[0.16em]"
                                style={{ color: ibkrConnected ? PALETTE.positive : PALETTE.warn }}
                            >
                                source {source || tick?.source}
                                {priceDelayed ? " · 15–20m delay" : ""}
                            </span>
                        </div>
                    ) : (
                        <div className="mt-1 text-[11px] font-mono text-slate-600">in attesa del primo tick…</div>
                    )}
                </div>
                {portfolio ? (
                    <div className="text-right">
                        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">
                            equity
                        </div>
                        <div className="mt-1 text-xl font-mono text-slate-100 tabular-nums">
                            {fmtMoney(portfolio.equity, ccy)}
                        </div>
                        <div
                            className="text-[11px] font-mono tabular-nums"
                            style={{ color: pnlColor(portfolio.total_pnl) }}
                        >
                            {portfolio.total_pnl >= 0 ? "+" : ""}
                            {fmtMoney(portfolio.total_pnl, ccy)} ({portfolio.total_return_pct >= 0 ? "+" : ""}
                            {fmtNum(portfolio.total_return_pct, 2)}%)
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Order entry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div>
                    <label
                        htmlFor="paper-qty"
                        className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 block mb-2"
                    >
                        Quantity
                    </label>
                    <input
                        id="paper-qty"
                        type="number"
                        min="0"
                        step="any"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        data-testid="paper-qty-input"
                        className="w-full bg-transparent border-b border-[#1B2335] focus:border-[#00E5C0] outline-none py-2.5 text-sm font-mono text-white tabular-nums"
                        placeholder="0.00"
                    />
                </div>
                <div>
                    <label
                        htmlFor="paper-order-type"
                        className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 block mb-2"
                    >
                        Order Type
                    </label>
                    <select
                        id="paper-order-type"
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value)}
                        data-testid="paper-order-type"
                        className="w-full bg-[#0A0F1C] border border-[#1B2335] focus:border-[#00E5C0] outline-none px-3 py-2.5 text-sm font-mono text-white"
                    >
                        <option value="market">Market</option>
                        <option value="limit">Limit</option>
                        <option value="stop">Stop</option>
                    </select>
                </div>
            </div>

            {orderType !== "market" ? (
                <div className="mb-3">
                    <label
                        htmlFor="paper-limit"
                        className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 block mb-2"
                    >
                        {orderType === "limit" ? "Limit price" : "Stop price"}
                    </label>
                    <input
                        id="paper-limit"
                        type="number"
                        min="0"
                        step="any"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        className="w-full bg-transparent border-b border-[#1B2335] focus:border-[#00E5C0] outline-none py-2.5 text-sm font-mono text-white tabular-nums"
                        placeholder={fmtNum(last, 4)}
                    />
                </div>
            ) : null}

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-4">
                <span className="uppercase tracking-[0.2em]">Est. cost</span>
                <span className="text-slate-200 tabular-nums" data-testid="paper-est-cost">
                    {Number.isFinite(estCost) ? fmtMoney(estCost, ccy) : "—"}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    disabled={submitting || !Number.isFinite(last)}
                    onClick={() => submit("buy")}
                    data-testid="paper-buy-btn"
                    className="flex items-center justify-center gap-2 py-3 border border-[#00E5C0] text-[#00E5C0] text-xs font-mono uppercase tracking-[0.25em] hover:bg-[#00E5C0] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#00E5C0]"
                >
                    <ArrowUpFromLine size={13} strokeWidth={1.8} />
                    Buy
                </button>
                <button
                    type="button"
                    disabled={submitting || !Number.isFinite(last)}
                    onClick={() => submit("sell")}
                    data-testid="paper-sell-btn"
                    className="flex items-center justify-center gap-2 py-3 border border-[#FF4D5E] text-[#FF4D5E] text-xs font-mono uppercase tracking-[0.25em] hover:bg-[#FF4D5E] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#FF4D5E]"
                >
                    <ArrowDownToLine size={13} strokeWidth={1.8} />
                    Sell
                </button>
            </div>

            {/* Portfolio table */}
            <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">
                        Portfolio · live P&amp;L
                    </span>
                    <button
                        type="button"
                        onClick={onReset}
                        data-testid="paper-reset-btn"
                        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 hover:text-[#FFB020] transition-colors"
                    >
                        <RotateCcw size={11} strokeWidth={1.8} />
                        Reset
                    </button>
                </div>

                {portfolio?.positions?.length ? (
                    <div className="overflow-x-auto border border-[#1B2335]">
                        <table className="w-full text-[11px] font-mono tabular-nums">
                            <thead>
                                <tr className="text-slate-500 uppercase tracking-[0.15em] text-[9px] border-b border-[#1B2335]">
                                    <th className="text-left px-3 py-2">Ticker</th>
                                    <th className="text-right px-3 py-2">Qty</th>
                                    <th className="text-right px-3 py-2">Avg</th>
                                    <th className="text-right px-3 py-2">Last</th>
                                    <th className="text-right px-3 py-2">Value</th>
                                    <th className="text-right px-3 py-2">uP&amp;L</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.positions.map((p) => (
                                    <tr
                                        key={p.ticker}
                                        className="border-b border-[#11182a] last:border-0"
                                        data-testid={`paper-pos-${p.ticker}`}
                                    >
                                        <td className="text-left px-3 py-2 text-slate-200">
                                            {p.ticker}
                                            <span
                                                className="ml-1.5 text-[8px] uppercase tracking-[0.15em]"
                                                style={{ color: p.side === "long" ? PALETTE.positive : PALETTE.danger }}
                                            >
                                                {p.side}
                                            </span>
                                        </td>
                                        <td className="text-right px-3 py-2 text-slate-300">{fmtNum(p.qty, 4)}</td>
                                        <td className="text-right px-3 py-2 text-slate-400">{fmtNum(p.avg_price, 2)}</td>
                                        <td className="text-right px-3 py-2 text-slate-200">{fmtNum(p.last_price, 2)}</td>
                                        <td className="text-right px-3 py-2 text-slate-300">{fmtMoney(p.market_value, ccy)}</td>
                                        <td className="text-right px-3 py-2" style={{ color: pnlColor(p.unrealized_pnl) }}>
                                            {p.unrealized_pnl >= 0 ? "+" : ""}
                                            {fmtMoney(p.unrealized_pnl, ccy)}
                                            <span className="block text-[9px] opacity-80">
                                                {p.unrealized_pct >= 0 ? "+" : ""}
                                                {fmtNum(p.unrealized_pct, 2)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="border border-dashed border-[#1B2335] px-4 py-6 text-center text-[11px] font-mono text-slate-600">
                        nessuna posizione aperta · invia un ordine per iniziare
                    </div>
                )}

                {portfolio ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="border border-[#1B2335] bg-[#0A0F1C] py-2">
                            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">Cash</div>
                            <div className="text-[12px] font-mono text-slate-200 tabular-nums">
                                {fmtMoney(portfolio.cash, ccy)}
                            </div>
                        </div>
                        <div className="border border-[#1B2335] bg-[#0A0F1C] py-2">
                            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">Realized</div>
                            <div
                                className="text-[12px] font-mono tabular-nums"
                                style={{ color: pnlColor(portfolio.realized_pnl) }}
                            >
                                {fmtMoney(portfolio.realized_pnl, ccy)}
                            </div>
                        </div>
                        <div className="border border-[#1B2335] bg-[#0A0F1C] py-2">
                            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">Unrealized</div>
                            <div
                                className="text-[12px] font-mono tabular-nums"
                                style={{ color: pnlColor(portfolio.unrealized_pnl) }}
                            >
                                {fmtMoney(portfolio.unrealized_pnl, ccy)}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </Panel>
        </>
    );
};

export default PaperTradingPanel;
