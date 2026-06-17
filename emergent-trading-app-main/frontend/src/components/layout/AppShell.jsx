import React, { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Sidebar from "./Sidebar";
import BrokerStatus from "./BrokerStatus";
import ModeToggle from "./ModeToggle";
import HorizonSelector from "./HorizonSelector";
import TickerSelector from "./TickerSelector";
import { ALL_NAV_ITEMS } from "../../config/navigation";
import { StatusBadge } from "../quant/shared/primitives";
import { useMarketData } from "../../context/MarketDataContext";
import { useTicker } from "../../context/TickerContext";
import TickerWelcomeScreen from "../../pages/TickerWelcomeScreen";

/**
 * AppShell — the persistent application frame.
 * When no ticker is selected, shows the welcome search screen instead of charts.
 */
const AppShell = () => {
    const { hasTicker } = useTicker();

    if (!hasTicker) {
        return <TickerWelcomeScreen />;
    }

    return <AppShellInner />;
};

const AppShellInner = () => {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const { status: feedStatus, lastPrice } = useMarketData();

    const active = useMemo(() => {
        const matches = ALL_NAV_ITEMS.filter(
            (i) => i.path === location.pathname || (i.path !== "/" && location.pathname.startsWith(i.path)),
        );
        if (matches.length === 0) {
            return ALL_NAV_ITEMS.find((i) => i.path === "/");
        }
        return matches.sort((a, b) => b.path.length - a.path.length)[0];
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-[#070B14] text-slate-200">
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

            <div
                className="transition-[margin] duration-200 ease-out"
                style={{ marginLeft: collapsed ? 68 : 264 }}
            >
                <header className="h-16 sticky top-0 z-30 flex items-center justify-between gap-4 px-6 sm:px-8 border-b border-[#1B2335] bg-[#070B14]/85 backdrop-blur-md">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-slate-600">
                            QuantDesk
                        </span>
                        <span className="text-slate-700">/</span>
                        <span className="text-[12px] font-mono uppercase tracking-[0.2em] text-slate-300 truncate">
                            {active?.label || "Workspace"}
                        </span>
                        {active ? <StatusBadge status={active.status} /> : null}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <TickerSelector />
                        <HorizonSelector />
                        <span className="hidden lg:block w-px h-6 bg-[#1B2335]" />
                        <BrokerStatus connected={feedStatus === "live" || lastPrice != null} />
                        <ModeToggle />
                    </div>
                </header>

                <main className="px-6 sm:px-8 lg:px-10 py-8 max-w-[1600px] mx-auto">
                    <Outlet key={location.pathname} />

                    <footer className="mt-12 border-t border-[#1B2335] pt-5">
                        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-700">
                            Stochastic models · TDA · PDE · Bayesian filtering — research
                            interface · not investment advice
                        </div>
                    </footer>
                </main>
            </div>
        </div>
    );
};

export default AppShell;
