import React, { useState } from "react";

import AppHeader from "../components/layout/AppHeader";
import TopologicalAnalysisView from "../components/quant/TopologicalAnalysisView";
import TickerSearch from "../components/quant/TickerSearch";
import PeriodSelector from "../components/quant/PeriodSelector";

const QUICK = ["SPY", "AAPL", "BTC-USD", "GLD", "^GSPC"];

const TopologicalAnalysisPage = () => {
    const [ticker, setTicker] = useState("AAPL");
    const [period, setPeriod] = useState("1y");

    return (
        <div
            className="min-h-screen bg-[#050505] text-white bg-grid"
            data-testid="topological-page"
        >
            <AppHeader />
            <main className="max-w-[1400px] mx-auto px-6 sm:px-10 py-10 sm:py-12">
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-3">
                    // TDA / Persistent Homology Workbench
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight font-medium leading-tight">
                    Mapping the <span className="text-[#00E5C0]">hidden geometry</span>
                    {" "}of markets
                </h1>
                <p className="mt-4 text-sm sm:text-base text-neutral-400 max-w-2xl leading-relaxed">
                    Reconstructed delay-coordinate phase space → simplicial Mapper graph
                    → persistent Betti / entropy invariants → sparse-regime detection
                    → ensemble SDE forecast (GBM + OU + Jump, particle filter)
                    → support violation heatmap & dynamic VaR. Computed server-side.
                </p>

                <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mt-10 mb-8">
                    <div className="flex-1 max-w-xl">
                        <TickerSearch
                            initialValue={ticker}
                            onSubmit={setTicker}
                            placeholder="ENTER TICKER (e.g. AAPL, SPY, BTC-USD)"
                        />
                        <div className="flex flex-wrap gap-2 mt-3">
                            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-600 self-center">
                                Quick:
                            </span>
                            {QUICK.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTicker(t)}
                                    data-testid={`tda-quick-${t}`}
                                    className={[
                                        "text-[11px] font-mono tracking-[0.15em] px-2.5 py-1 border",
                                        ticker === t
                                            ? "border-[#00E5C0] text-[#00E5C0]"
                                            : "border-[#222222] text-neutral-400 hover:border-white/40 hover:text-white",
                                        "transition-colors duration-150",
                                    ].join(" ")}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                    <PeriodSelector value={period} onChange={setPeriod} />
                </section>

                <TopologicalAnalysisView ticker={ticker} period={period} />

                <footer className="mt-10 border-t border-[#222222] pt-5">
                    <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                        Mapper · Vietoris–Rips · Persistent Homology · Ensemble SDE · VaR —
                        not investment advice
                    </div>
                </footer>
            </main>
        </div>
    );
};

export default TopologicalAnalysisPage;
