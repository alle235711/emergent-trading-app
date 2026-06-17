import React, { useMemo } from "react";

import { useTrading } from "../../context/TradingContext";
import { formatPercent } from "../../lib/format";

const formatMoney = (v, currency = "€") =>
    new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: currency === "€" ? "EUR" : "USD",
        maximumFractionDigits: 2,
    }).format(v);

const formatShares = (v) => {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1000) return v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
    return v.toLocaleString("it-IT", { maximumFractionDigits: 4 });
};

const tone = (pl) =>
    pl > 0
        ? "text-[#00E5C0]"
        : pl < 0
          ? "text-[#FF3B30]"
          : "text-neutral-200";

const PositionsTable = () => {
    const { simulatedPositions, currency } = useTrading();

    const rows = useMemo(() => {
        return simulatedPositions.map((p) => {
            const market = (p.lastPrice || p.avgPrice) * p.shares;
            const cost = p.avgPrice * p.shares;
            const plAbs = market - cost;
            const plPct = cost > 0 ? plAbs / cost : 0;
            return { ...p, market, plAbs, plPct };
        });
    }, [simulatedPositions]);

    const totals = useMemo(() => {
        const marketValue = rows.reduce((acc, r) => acc + r.market, 0);
        const costBasis = rows.reduce((acc, r) => acc + r.avgPrice * r.shares, 0);
        const plAbs = marketValue - costBasis;
        const plPct = costBasis > 0 ? plAbs / costBasis : 0;
        return { marketValue, costBasis, plAbs, plPct };
    }, [rows]);

    return (
        <section
            className="border border-[#222222] bg-[#0F0F0F]"
            data-testid="positions-table-section"
        >
            <header className="border-b border-[#222222] px-5 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // Open positions
                    </div>
                    <h2 className="text-lg sm:text-xl font-mono mt-1">
                        Holdings
                        <span className="text-[#00E5C0] ml-2 text-xs tracking-[0.2em]">
                            {rows.length}
                        </span>
                    </h2>
                </div>
                <div className="flex items-center gap-6 text-[11px] font-mono uppercase tracking-[0.2em]">
                    <div>
                        <div className="text-neutral-500">Market value</div>
                        <div className="text-white text-sm mt-1 normal-case tracking-normal">
                            {formatMoney(totals.marketValue, currency)}
                        </div>
                    </div>
                    <div>
                        <div className="text-neutral-500">Unrealized P&amp;L</div>
                        <div
                            className={`text-sm mt-1 normal-case tracking-normal ${tone(totals.plAbs)}`}
                            data-testid="positions-total-pl"
                        >
                            {formatMoney(totals.plAbs, currency)}{" "}
                            <span className="text-[10px] uppercase tracking-[0.2em]">
                                {formatPercent(totals.plPct)}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {rows.length === 0 ? (
                <div
                    className="text-xs font-mono uppercase tracking-[0.25em] text-neutral-600 py-12 text-center border border-dashed border-[#222222] m-5"
                    data-testid="positions-empty"
                >
                    // Nessuna posizione aperta
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table
                        className="w-full text-sm font-mono"
                        data-testid="positions-table"
                    >
                        <thead className="bg-[#0A0A0A] text-[10px] uppercase tracking-[0.25em] text-neutral-500">
                            <tr className="border-b border-[#222222]">
                                <th className="text-left px-5 sm:px-6 py-3">Ticker</th>
                                <th className="text-left px-3 py-3">Class</th>
                                <th className="text-right px-3 py-3">Shares</th>
                                <th className="text-right px-3 py-3">Avg price</th>
                                <th className="text-right px-3 py-3">Current</th>
                                <th className="text-right px-3 py-3">Market value</th>
                                <th className="text-right px-5 sm:px-6 py-3">P&amp;L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={r.id}
                                    data-testid={`positions-row-${r.ticker}`}
                                    className="border-b border-[#1A1A1A] last:border-b-0 hover:bg-[#0A0A0A] transition-colors"
                                >
                                    <td className="px-5 sm:px-6 py-3 text-white">
                                        <div className="flex items-center gap-2">
                                            <span>{r.ticker}</span>
                                            {r.seeded ? (
                                                <span className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 border border-[#222222] px-1.5 py-0.5">
                                                    seed
                                                </span>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-neutral-400 text-xs uppercase tracking-[0.2em]">
                                        {r.assetClass}
                                    </td>
                                    <td className="px-3 py-3 text-right text-neutral-200">
                                        {formatShares(r.shares)}
                                    </td>
                                    <td className="px-3 py-3 text-right text-neutral-200">
                                        {formatMoney(r.avgPrice, currency)}
                                    </td>
                                    <td className="px-3 py-3 text-right text-neutral-200">
                                        {formatMoney(r.lastPrice || r.avgPrice, currency)}
                                    </td>
                                    <td className="px-3 py-3 text-right text-neutral-200">
                                        {formatMoney(r.market, currency)}
                                    </td>
                                    <td
                                        className={`px-5 sm:px-6 py-3 text-right ${tone(r.plAbs)}`}
                                    >
                                        <div className="leading-tight">
                                            {formatPercent(r.plPct)}
                                        </div>
                                        <div className="text-[10px] text-neutral-500 mt-0.5 tracking-wide">
                                            {formatMoney(r.plAbs, currency)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

export default PositionsTable;
