import React, { useState } from "react";
import { Search } from "lucide-react";

import { useTicker } from "../context/TickerContext";
import { fetchTickerValidate } from "../lib/api";
import { pushRecentTicker } from "../lib/recentTickers";

const QUICK_PICKS = [
    { symbol: "SPY", label: "US Equity" },
    { symbol: "QQQ", label: "Tech" },
    { symbol: "BTC-USD", label: "Crypto" },
    { symbol: "GLD", label: "Commodity" },
    { symbol: "TLT", label: "Bond" },
    { symbol: "SWDA.MI", label: "EU ETF" },
];

const TickerWelcomeScreen = () => {
    const { setTicker } = useTicker();
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (raw) => {
        const sym = (raw ?? query).trim().toUpperCase();
        if (!sym) return;
        setLoading(true);
        setError(null);
        try {
            const result = await fetchTickerValidate(sym);
            if (!result.valid) {
                setError("Ticker non trovato su Yahoo Finance");
                return;
            }
            pushRecentTicker(result.symbol, { name: result.name, type: result.type });
            setTicker(result.symbol);
        } catch {
            setError("Ticker non trovato su Yahoo Finance");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center px-6"
            data-testid="ticker-welcome-screen"
        >
            <div className="w-full max-w-xl text-center">
                <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-slate-600 mb-3">
                    QuantDesk
                </p>
                <h1 className="text-2xl sm:text-3xl font-mono text-slate-100 mb-2 tracking-tight">
                    Seleziona uno strumento
                </h1>
                <p className="text-[12px] font-mono text-slate-500 mb-10 leading-relaxed">
                    Cerca qualsiasi ticker Yahoo Finance — azioni, ETF, ETN, crypto, indici.
                </p>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                    className="flex flex-col sm:flex-row gap-3 mb-4"
                >
                    <div className="flex-1 flex items-center gap-3 border border-[#1B2335] bg-[#0A0F1C] px-4 py-3 focus-within:border-[#00E5C0]/60 transition-colors">
                        <Search size={18} className="text-slate-600 shrink-0" />
                        <input
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setError(null);
                            }}
                            placeholder="Cerca ticker — es. AAPL, BTC-USD, SWDA.MI, SPY"
                            spellCheck={false}
                            autoComplete="off"
                            autoFocus
                            disabled={loading}
                            data-testid="welcome-ticker-input"
                            className="w-full bg-transparent outline-none text-[15px] font-mono uppercase tracking-wide text-white placeholder:text-slate-600 placeholder:normal-case placeholder:tracking-normal"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !query.trim()}
                        data-testid="welcome-ticker-submit"
                        className="px-6 py-3 text-[11px] font-mono uppercase tracking-[0.25em] border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors disabled:opacity-40"
                    >
                        {loading ? "Verifica…" : "Cerca"}
                    </button>
                </form>

                {error && (
                    <p className="text-[12px] font-mono text-[#FF9AA5] mb-6" data-testid="welcome-ticker-error">
                        {error}
                    </p>
                )}

                <div className="flex flex-wrap justify-center gap-2 mt-6">
                    {QUICK_PICKS.map((item) => (
                        <button
                            key={item.symbol}
                            type="button"
                            disabled={loading}
                            onClick={() => submit(item.symbol)}
                            data-testid={`welcome-chip-${item.symbol}`}
                            className="px-3 py-2 text-[11px] font-mono border border-[#1B2335] bg-[#0A0F1C] text-slate-300 hover:border-[#2A3550] hover:text-white transition-colors disabled:opacity-40"
                        >
                            <span className="text-[#00E5C0]">{item.symbol}</span>
                            <span className="text-slate-600 ml-2">({item.label})</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TickerWelcomeScreen;
