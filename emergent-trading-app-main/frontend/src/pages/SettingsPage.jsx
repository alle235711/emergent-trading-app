import React from "react";
import { User, Beaker } from "lucide-react";

import WatchlistSection from "../components/settings/WatchlistSection";
import BrokerIntegrationSection from "../components/settings/BrokerIntegrationSection";
import AlertEmailSection from "../components/settings/AlertEmailSection";
import { useAuth } from "../context/AuthContext";
import { useDemoMode } from "../context/DemoModeContext";

const SettingsPage = () => {
    const { user } = useAuth();
    const { demoMode, toggleDemoMode } = useDemoMode();

    return (
        <div data-testid="settings-page">
            <div>
                {/* Hero */}
                <div className="mb-10">
                    <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-3">
                        // User settings
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight font-medium leading-tight">
                        Your{" "}
                        <span className="text-[#00E5C0]">workspace</span>
                    </h1>
                    <p className="mt-4 text-sm sm:text-base text-neutral-400 max-w-2xl leading-relaxed">
                        Gestisci la tua watchlist personale e prepara la connessione al
                        tuo broker. Le credenziali sono salvate solo per la futura
                        integrazione operativa; nessun ordine viene inviato in questa
                        fase.
                    </p>

                    <div
                        className="mt-6 inline-flex items-center gap-3 border border-[#222222] bg-[#0F0F0F] px-4 py-2.5"
                        data-testid="settings-user-card"
                    >
                        <User size={14} className="text-[#00E5C0]" strokeWidth={1.5} />
                        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-500">
                            Signed in as
                        </div>
                        <div className="font-mono text-sm text-white">
                            {user?.email}
                        </div>
                        <div className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600 border-l border-[#222222] pl-3">
                            uid · {user?.id?.slice(0, 8)}…
                        </div>
                    </div>
                </div>

                {/* Demo Mode */}
                <div className="mb-8 border border-[#FFB020]/40 bg-[#FFB020]/[0.05] p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] text-[#FFB020]">
                                <Beaker size={14} />
                                Demo Mode
                            </div>
                            <p className="mt-2 text-sm text-neutral-400 max-w-xl leading-relaxed">
                                Carica dati sintetici (MOCK) nelle pagine R&amp;D senza endpoint live.
                                Disabilitato per default — nessun numero fittizio in produzione.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={toggleDemoMode}
                            data-testid="demo-mode-toggle"
                            className={`shrink-0 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.2em] border transition-colors ${
                                demoMode
                                    ? "border-[#FFB020] bg-[#FFB020] text-black"
                                    : "border-[#333] text-neutral-400 hover:text-white"
                            }`}
                        >
                            {demoMode ? "Demo ON" : "Demo OFF"}
                        </button>
                    </div>
                </div>

                {/* Sections */}
                <div className="mb-8">
                    <AlertEmailSection />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <WatchlistSection />
                    <BrokerIntegrationSection />
                </div>

                <footer className="mt-10 border-t border-[#222222] pt-5">
                    <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                        Watchlist &amp; broker keys scoped to your local user_id · Mocked
                        auth — not for production
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default SettingsPage;
