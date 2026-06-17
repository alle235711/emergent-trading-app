import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";

import {
    addWatchlistTicker,
    getWatchlist,
    removeWatchlistTicker,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Personal watchlist tile.
 * CRUD against /api/user/watchlist scoped by the mocked-auth user_id.
 */
const WatchlistSection = () => {
    const { user } = useAuth();
    const [tickers, setTickers] = useState([]);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const data = await getWatchlist(user.id);
            setTickers(data.tickers || []);
            setUpdatedAt(data.updated_at || null);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || err?.message || "Errore caricamento watchlist";
            toast.error(`ERR :: ${String(detail).toUpperCase()}`);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        load();
    }, [load]);

    const handleAdd = async (e) => {
        e?.preventDefault();
        const ticker = input.trim().toUpperCase();
        if (!ticker) return;
        setBusy(true);
        try {
            const data = await addWatchlistTicker(user.id, ticker);
            setTickers(data.tickers || []);
            setUpdatedAt(data.updated_at || null);
            setInput("");
            toast.success(`ADDED :: ${ticker}`);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || err?.message || "Errore aggiunta ticker";
            toast.error(`ERR :: ${String(detail).toUpperCase()}`);
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (ticker) => {
        setBusy(true);
        try {
            const data = await removeWatchlistTicker(user.id, ticker);
            setTickers(data.tickers || []);
            setUpdatedAt(data.updated_at || null);
            toast.success(`REMOVED :: ${ticker}`);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || err?.message || "Errore rimozione ticker";
            toast.error(`ERR :: ${String(detail).toUpperCase()}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section
            className="border border-[#222222] bg-[#0F0F0F]"
            data-testid="settings-watchlist-section"
        >
            <header className="border-b border-[#222222] px-5 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // Personal watchlist
                    </div>
                    <h2 className="text-lg sm:text-xl font-mono mt-1">
                        Watchlist
                        <span className="text-[#00E5C0] ml-2 text-xs tracking-[0.2em]">
                            {loading ? "—" : `${tickers.length}/50`}
                        </span>
                    </h2>
                </div>
                {updatedAt ? (
                    <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                        Updated · {new Date(updatedAt).toLocaleString()}
                    </div>
                ) : null}
            </header>

            <div className="p-5 sm:p-6 space-y-6">
                <form
                    onSubmit={handleAdd}
                    className="flex items-center gap-3"
                    data-testid="watchlist-add-form"
                >
                    <div className="flex items-center gap-3 flex-1 border-b border-[#222222] focus-within:border-[#00E5C0] transition-colors duration-150">
                        <Plus
                            size={16}
                            className="text-neutral-500 shrink-0"
                            strokeWidth={1.5}
                        />
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="ADD TICKER (e.g. AAPL, BTC-USD, EURUSD=X)"
                            disabled={busy}
                            spellCheck={false}
                            autoComplete="off"
                            data-testid="watchlist-input"
                            className="bg-transparent w-full py-3 outline-none border-0 text-sm font-mono uppercase tracking-wider placeholder:text-neutral-600 text-white"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={busy || !input.trim()}
                        data-testid="watchlist-add-btn"
                        className="text-xs font-mono tracking-[0.2em] uppercase px-4 py-3 border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#00E5C0]"
                    >
                        Add
                    </button>
                </form>

                {loading ? (
                    <div className="text-xs font-mono uppercase tracking-[0.3em] text-neutral-500 animate-term-pulse py-8 text-center">
                        Loading watchlist<span className="caret-blink">_</span>
                    </div>
                ) : tickers.length === 0 ? (
                    <div
                        className="text-xs font-mono uppercase tracking-[0.25em] text-neutral-600 py-8 text-center border border-dashed border-[#222222]"
                        data-testid="watchlist-empty"
                    >
                        // Nessun ticker monitorato. Aggiungi il primo qui sopra.
                    </div>
                ) : (
                    <div
                        className="border border-[#222222]"
                        data-testid="watchlist-table"
                    >
                        <div className="grid grid-cols-[1fr_120px_60px] text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 border-b border-[#222222] px-4 py-2 bg-[#0A0A0A]">
                            <div>Symbol</div>
                            <div className="hidden sm:block">Class</div>
                            <div className="text-right">Action</div>
                        </div>
                        <ul>
                            {tickers.map((t) => (
                                <li
                                    key={t}
                                    data-testid={`watchlist-row-${t}`}
                                    className="grid grid-cols-[1fr_120px_60px] items-center px-4 py-3 border-b border-[#222222] last:border-b-0 hover:bg-[#0A0A0A] transition-colors"
                                >
                                    <div className="font-mono text-sm text-white">
                                        {t}
                                    </div>
                                    <div className="hidden sm:block font-mono text-[11px] text-neutral-500 uppercase tracking-[0.2em]">
                                        {classifyTicker(t)}
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleRemove(t)}
                                            data-testid={`watchlist-remove-${t}`}
                                            className="text-neutral-500 hover:text-[#FF3B30] transition-colors disabled:opacity-40"
                                            aria-label={`Remove ${t}`}
                                        >
                                            <Trash2 size={14} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
};

const classifyTicker = (t) => {
    if (!t) return "—";
    if (t.endsWith("-USD")) return "Crypto";
    if (t.endsWith("=X")) return "Forex";
    if (t.includes(".")) return "ETF";
    if (t.startsWith("^")) return "Index";
    return "Stock";
};

export default WatchlistSection;
