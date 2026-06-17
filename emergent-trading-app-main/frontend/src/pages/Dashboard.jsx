import React, { useState } from "react";

import AppHeader from "../components/layout/AppHeader";
import AssetTabs from "../components/quant/AssetTabs";
import AnalysisView from "../components/quant/AnalysisView";
import DashboardHero from "../components/quant/tda/DashboardHero";

/**
 * Per-asset-class view configuration.
 * Adding a new asset class is just a matter of adding an entry here.
 */
const VIEW_CONFIG = {
    etf: {
        defaultTicker: "SPY",
        assetLabel: "ETF / Equity",
        searchPlaceholder: "ENTER TICKER (e.g. SPY, AAPL, BTC-USD, ^GSPC)",
        quickTickers: ["SPY", "QQQ", "GLD", "SWDA.MI", "^GSPC"],
        testIdPrefix: "etf",
    },
    crypto: {
        defaultTicker: "BTC-USD",
        assetLabel: "Crypto",
        searchPlaceholder: "ENTER CRYPTO TICKER (e.g. BTC-USD, ETH-USD, SOL-USD)",
        quickTickers: ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"],
        testIdPrefix: "crypto",
    },
    forex: {
        defaultTicker: "EURUSD=X",
        assetLabel: "Forex",
        searchPlaceholder: "ENTER FX PAIR (e.g. EURUSD=X, GBPUSD=X, USDJPY=X)",
        quickTickers: [
            "EURUSD=X",
            "GBPUSD=X",
            "USDJPY=X",
            "USDCHF=X",
            "EURGBP=X",
        ],
        testIdPrefix: "forex",
    },
    stocks: {
        defaultTicker: "AAPL",
        assetLabel: "Stocks",
        searchPlaceholder: "ENTER STOCK TICKER (e.g. AAPL, MSFT, NVDA)",
        quickTickers: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"],
        testIdPrefix: "stocks",
    },
};

const Dashboard = () => {
    const [assetClass, setAssetClass] = useState("etf");
    const config = VIEW_CONFIG[assetClass];

    return (
        <div
            className="min-h-screen bg-[#050505] text-white bg-grid"
            data-testid="dashboard-page"
        >
            <AppHeader />

            <main className="max-w-[1400px] mx-auto px-6 sm:px-10 py-10 sm:py-12">
                {/* Hero with animated Mapper graph background */}
                <DashboardHero />

                {/* Asset class tabs */}
                <div className="mb-10">
                    <AssetTabs value={assetClass} onChange={setAssetClass} />
                </div>

                {/*
                  `key` forces a clean remount of the analysis view when the
                  asset class changes, so internal state (ticker, period, data)
                  resets cleanly to the new class defaults.
                */}
                <AnalysisView
                    key={assetClass}
                    defaultTicker={config.defaultTicker}
                    assetLabel={config.assetLabel}
                    searchPlaceholder={config.searchPlaceholder}
                    quickTickers={config.quickTickers}
                    testIdPrefix={config.testIdPrefix}
                />

                <footer className="mt-10 border-t border-[#222222] pt-5">
                    <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                        Data ingested via yfinance · Computations in pandas / numpy ·
                        Not investment advice
                    </div>
                </footer>
            </main>
        </div>
    );
};

export default Dashboard;
