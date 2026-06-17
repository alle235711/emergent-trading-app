import React from "react";
import { toast } from "sonner";
import { Beaker, RefreshCcw, Wallet } from "lucide-react";

import PositionsTable from "../components/portfolio/PositionsTable";
import CapitalTrajectoryChart from "../components/portfolio/CapitalTrajectoryChart";
import { useTrading } from "../context/TradingContext";

const formatMoney = (v, currency = "€") =>
    new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: currency === "€" ? "EUR" : "USD",
        maximumFractionDigits: 2,
    }).format(v);

const PortfolioPage = () => {
    const {
        isPaper,
        simulatedBalance,
        portfolioValue,
        currency,
        resetSimulation,
        simulatedPositions,
    } = useTrading();

    const handleReset = () => {
        resetSimulation();
        toast.success("SIM_RESET :: BALANCE BACK TO 50,000");
    };

    const investedValue = portfolioValue - simulatedBalance;

    return (
        <div data-testid="portfolio-page">
            <div>
                {/* Hero */}
                <div className="mb-10">
                    <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-3">
                        // Portfolio
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight font-medium leading-tight">
                        Open positions &{" "}
                        <span className="text-[#00E5C0]">capital trajectory</span>
                    </h1>
                    <p className="mt-4 text-sm sm:text-base text-neutral-400 max-w-2xl leading-relaxed">
                        Visualizzazione delle posizioni aperte (simulate) e
                        proiezione del capitale a lungo termine. In modalità Paper i
                        tuoi ordini scalano qui in tempo reale dal saldo iniziale
                        di {formatMoney(50000, currency)}.
                    </p>
                </div>

                {/* Summary tiles */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <SummaryTile
                        label="Mode"
                        value={isPaper ? "Paper" : "Real"}
                        sub={isPaper ? "Simulated trading" : "No broker connected"}
                        tone={isPaper ? "warning" : "neutral"}
                        icon={<Beaker size={14} strokeWidth={1.6} />}
                        testId="portfolio-summary-mode"
                    />
                    <SummaryTile
                        label="Cash balance"
                        value={formatMoney(simulatedBalance, currency)}
                        sub="Available to deploy"
                        icon={<Wallet size={14} strokeWidth={1.6} />}
                        testId="portfolio-summary-cash"
                    />
                    <SummaryTile
                        label="Invested"
                        value={formatMoney(investedValue, currency)}
                        sub={`${simulatedPositions.length} positions`}
                        testId="portfolio-summary-invested"
                    />
                    <SummaryTile
                        label="Total equity"
                        value={formatMoney(portfolioValue, currency)}
                        sub="Cash + market value"
                        tone="positive"
                        testId="portfolio-summary-equity"
                    />
                </section>

                {/* Sections */}
                <div className="space-y-8">
                    <PositionsTable />
                    <CapitalTrajectoryChart />
                </div>

                <footer className="mt-10 border-t border-[#222222] pt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                        Paper trading state stored locally · No broker order has been sent
                    </div>
                    <button
                        type="button"
                        onClick={handleReset}
                        data-testid="portfolio-reset-btn"
                        className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] px-3 py-2 border border-[#222222] text-neutral-400 hover:border-[#FF3B30] hover:text-[#FF3B30] transition-colors duration-150"
                    >
                        <RefreshCcw size={12} strokeWidth={1.6} />
                        Reset simulation
                    </button>
                </footer>
            </div>
        </div>
    );
};

const SummaryTile = ({ label, value, sub, tone = "neutral", icon, testId }) => {
    const toneClass =
        tone === "positive"
            ? "text-[#00E5C0]"
            : tone === "warning"
              ? "text-[#FFB020]"
              : tone === "negative"
                ? "text-[#FF3B30]"
                : "text-white";
    return (
        <div
            className="border border-[#222222] bg-[#0F0F0F] p-5 sm:p-6 flex flex-col justify-between min-h-[140px] hover:border-white/30 transition-all duration-150 ease-out"
            data-testid={testId}
        >
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                    {label}
                </div>
                {icon ? <div className="text-neutral-500">{icon}</div> : null}
            </div>
            <div className="mt-3">
                <div
                    className={`text-2xl sm:text-3xl font-mono font-medium tracking-tight ${toneClass}`}
                >
                    {value}
                </div>
            </div>
            {sub ? (
                <div className="mt-2 text-[11px] font-mono text-neutral-500 tracking-wide">
                    {sub}
                </div>
            ) : null}
        </div>
    );
};

export default PortfolioPage;
