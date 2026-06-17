import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    Beaker,
    Send,
    Wallet,
} from "lucide-react";

import { useTrading } from "../../context/TradingContext";
import { formatPrice } from "../../lib/format";

const ORDER_TYPES = [
    { value: "market", label: "Market" },
    { value: "limit", label: "Limit" },
    { value: "stop", label: "Stop" },
];

const formatBalance = (v, currency) =>
    new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: currency === "€" ? "EUR" : "USD",
        maximumFractionDigits: 2,
    }).format(v);

/**
 * Order entry ticket.
 * Props:
 *   ticker        – current symbol from the AnalysisView
 *   currentPrice  – last close (used as the live reference price)
 *   currency      – display currency hint (e.g. "EUR", "USD")
 *   testIdPrefix  – e.g. "etf", "crypto", "forex", "stocks"
 */
const OrderTicket = ({ ticker, currentPrice, currency, testIdPrefix = "view" }) => {
    const {
        mode,
        isPaper,
        simulatedBalance,
        currency: simCurrency,
        submitOrder,
    } = useTrading();

    const [side, setSide] = useState("buy");
    const [orderType, setOrderType] = useState("market");
    const [quantity, setQuantity] = useState("1");
    const [limitPrice, setLimitPrice] = useState("");

    // Pre-fill limit price with the current price when the user picks
    // a non-market order type or when the ticker changes.
    useEffect(() => {
        if (orderType !== "market" && currentPrice) {
            setLimitPrice(String(Number(currentPrice).toFixed(4)));
        }
    }, [orderType, currentPrice]);

    const qtyNum = Number(quantity);
    const estimatedCost =
        Number.isFinite(qtyNum) && Number.isFinite(currentPrice)
            ? qtyNum * currentPrice
            : null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const res = submitOrder({
            ticker,
            currentPrice,
            quantity: qtyNum,
            side,
            orderType,
            limitPrice: orderType === "market" ? null : Number(limitPrice),
        });
        if (res.ok) {
            toast.success(
                `${isPaper ? "PAPER" : "ORDER"} :: ${side.toUpperCase()} ${ticker} × ${qtyNum}`,
            );
        } else {
            toast.error(`ERR :: ${String(res.message).toUpperCase()}`);
        }
    };

    const sideTone =
        side === "buy"
            ? "border-[#00E5C0] text-[#00E5C0]"
            : "border-[#FF3B30] text-[#FF3B30]";

    const submitDisabled =
        !ticker || !Number.isFinite(currentPrice) || !Number.isFinite(qtyNum) || qtyNum <= 0;

    return (
        <aside
            className="border border-[#222222] bg-[#0F0F0F] flex flex-col"
            data-testid={`${testIdPrefix}-order-ticket`}
        >
            <header className="border-b border-[#222222] px-5 py-4 flex items-center justify-between">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // Order Ticket
                    </div>
                    <div className="text-sm font-mono mt-1">
                        {ticker || "—"}
                        <span className="text-neutral-500 ml-2 text-[10px] tracking-[0.2em] uppercase">
                            {orderType}
                        </span>
                    </div>
                </div>
                <div
                    className={[
                        "text-[10px] font-mono uppercase tracking-[0.25em] px-2 py-1 border",
                        isPaper
                            ? "border-[#FFB020] text-[#FFB020]"
                            : "border-[#222222] text-neutral-500",
                    ].join(" ")}
                    data-testid={`${testIdPrefix}-order-mode-pill`}
                >
                    {isPaper ? (
                        <span className="flex items-center gap-1">
                            <Beaker size={11} strokeWidth={1.6} />
                            Paper
                        </span>
                    ) : (
                        "Real"
                    )}
                </div>
            </header>

            <form onSubmit={handleSubmit} className="p-5 space-y-5 flex-1">
                {/* Paper balance */}
                {isPaper ? (
                    <div
                        className="border border-[#FFB020]/30 bg-[#FFB020]/5 px-3 py-3 flex items-center justify-between gap-3"
                        data-testid={`${testIdPrefix}-order-sim-balance`}
                    >
                        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-[#FFB020]">
                            <Wallet size={12} strokeWidth={1.6} />
                            Sim. Balance
                        </div>
                        <div className="text-sm font-mono text-white">
                            {formatBalance(simulatedBalance, simCurrency)}
                        </div>
                    </div>
                ) : null}

                {/* Side toggle */}
                <div className="grid grid-cols-2 border border-[#222222]" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={side === "buy"}
                        onClick={() => setSide("buy")}
                        data-testid={`${testIdPrefix}-order-side-buy`}
                        className={[
                            "flex items-center justify-center gap-2 py-2.5 text-xs font-mono uppercase tracking-[0.25em] border-r border-[#222222] transition-colors duration-150",
                            side === "buy"
                                ? "bg-[#00E5C0]/10 text-[#00E5C0]"
                                : "text-neutral-500 hover:text-white",
                        ].join(" ")}
                    >
                        <ArrowUpFromLine size={13} strokeWidth={1.6} />
                        Buy
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={side === "sell"}
                        onClick={() => setSide("sell")}
                        data-testid={`${testIdPrefix}-order-side-sell`}
                        className={[
                            "flex items-center justify-center gap-2 py-2.5 text-xs font-mono uppercase tracking-[0.25em] transition-colors duration-150",
                            side === "sell"
                                ? "bg-[#FF3B30]/10 text-[#FF3B30]"
                                : "text-neutral-500 hover:text-white",
                        ].join(" ")}
                    >
                        <ArrowDownToLine size={13} strokeWidth={1.6} />
                        Sell
                    </button>
                </div>

                {/* Quantity */}
                <div>
                    <label
                        htmlFor={`${testIdPrefix}-qty`}
                        className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                    >
                        Quantity
                    </label>
                    <input
                        id={`${testIdPrefix}-qty`}
                        type="number"
                        step="any"
                        min="0"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        data-testid={`${testIdPrefix}-order-qty-input`}
                        className="w-full bg-transparent border-b border-[#222222] focus:border-[#00E5C0] outline-none py-3 text-sm font-mono text-white placeholder:text-neutral-600"
                        placeholder="0.00"
                    />
                </div>

                {/* Order type */}
                <div>
                    <label
                        htmlFor={`${testIdPrefix}-order-type`}
                        className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                    >
                        Order Type
                    </label>
                    <select
                        id={`${testIdPrefix}-order-type`}
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value)}
                        data-testid={`${testIdPrefix}-order-type-select`}
                        className="w-full bg-[#0A0A0A] border border-[#222222] focus:border-[#00E5C0] outline-none px-3 py-3 text-sm font-mono text-white"
                    >
                        {ORDER_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Limit price (only for Limit/Stop) */}
                {orderType !== "market" ? (
                    <div>
                        <label
                            htmlFor={`${testIdPrefix}-limit-price`}
                            className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                        >
                            {orderType === "limit" ? "Limit price" : "Stop price"}
                        </label>
                        <input
                            id={`${testIdPrefix}-limit-price`}
                            type="number"
                            step="any"
                            min="0"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(e.target.value)}
                            data-testid={`${testIdPrefix}-order-limit-input`}
                            className="w-full bg-transparent border-b border-[#222222] focus:border-[#00E5C0] outline-none py-3 text-sm font-mono text-white"
                        />
                    </div>
                ) : null}

                {/* Reference + cost preview */}
                <div className="border-t border-[#222222] pt-4 grid grid-cols-2 gap-y-2 text-[11px] font-mono">
                    <span className="text-neutral-500 uppercase tracking-[0.2em]">
                        Reference
                    </span>
                    <span className="text-right text-neutral-200">
                        {Number.isFinite(currentPrice)
                            ? formatPrice(currentPrice, currency)
                            : "—"}
                    </span>
                    <span className="text-neutral-500 uppercase tracking-[0.2em]">
                        Est. cost
                    </span>
                    <span
                        className="text-right text-white"
                        data-testid={`${testIdPrefix}-order-est-cost`}
                    >
                        {Number.isFinite(estimatedCost)
                            ? formatBalance(estimatedCost, simCurrency)
                            : "—"}
                    </span>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={submitDisabled}
                    data-testid={`${testIdPrefix}-order-submit-btn`}
                    className={[
                        "w-full flex items-center justify-center gap-3 px-4 py-4 border text-xs font-mono uppercase tracking-[0.3em] transition-colors duration-150",
                        sideTone,
                        side === "buy"
                            ? "hover:bg-[#00E5C0] hover:text-black"
                            : "hover:bg-[#FF3B30] hover:text-black",
                        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                    ].join(" ")}
                >
                    <Send size={14} strokeWidth={1.6} />
                    Submit {side} order
                </button>

                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600 text-center leading-relaxed">
                    {mode === "real"
                        ? "// no broker connected · order will only be logged"
                        : "// paper trading · executes locally on this device"}
                </div>
            </form>
        </aside>
    );
};

export default OrderTicket;
