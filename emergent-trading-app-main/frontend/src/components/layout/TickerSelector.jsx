import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search, Activity, CornerDownLeft, Clock } from "lucide-react";

import { useTicker } from "../../context/TickerContext";
import { useMarketData } from "../../context/MarketDataContext";
import { TICKER_CATALOG, tickerAccent } from "../../lib/tickers";
import { fetchTickerSearch, fetchTickerValidate } from "../../lib/api";
import { readRecentTickers } from "../../lib/recentTickers";

/**
 * TickerSelector — universal Yahoo Finance symbol picker with live search.
 */
const TickerSelector = () => {
    const { symbol, ticker, setTicker } = useTicker();
    const { lastPrice } = useMarketData();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const [remoteResults, setRemoteResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [recent, setRecent] = useState([]);
    const [error, setError] = useState(null);
    const ref = useRef(null);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    const accent = tickerAccent(ticker);

    const customSymbol = query.trim().toUpperCase();
    const showCustom = customSymbol.length > 0;

    const catalogResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return TICKER_CATALOG.filter(
            (t) =>
                t.symbol.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q),
        );
    }, [query]);

    const results = useMemo(() => {
        if (query.trim().length >= 1 && remoteResults.length > 0) {
            return remoteResults;
        }
        if (query.trim().length >= 1 && catalogResults.length > 0) {
            return catalogResults.map((t) => ({
                symbol: t.symbol,
                name: t.name,
                type: t.assetClass,
            }));
        }
        return [];
    }, [query, remoteResults, catalogResults]);

    const totalRows = results.length + (showCustom ? 1 : 0);

    useEffect(() => {
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    useEffect(() => {
        if (open) {
            setQuery("");
            setCursor(0);
            setError(null);
            setRecent(readRecentTickers());
            const id = setTimeout(() => inputRef.current?.focus(), 10);
            return () => clearTimeout(id);
        }
        return undefined;
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const q = query.trim();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (q.length < 1) {
            setRemoteResults([]);
            setSearching(false);
            return undefined;
        }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await fetchTickerSearch(q);
                setRemoteResults(Array.isArray(data) ? data : []);
            } catch {
                setRemoteResults([]);
            } finally {
                setSearching(false);
            }
        }, 280);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, open]);

    const choose = useCallback(
        async (sym, meta = {}) => {
            const s = (sym || "").trim().toUpperCase();
            if (!s) return;
            setError(null);
            try {
                const validated = await fetchTickerValidate(s);
                if (!validated.valid) {
                    setError("Ticker non trovato su Yahoo Finance");
                    return;
                }
                setTicker(validated.symbol, {
                    name: validated.name,
                    type: validated.type,
                    ...meta,
                });
                setOpen(false);
            } catch {
                setError("Ticker non trovato su Yahoo Finance");
            }
        },
        [setTicker],
    );

    const onKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(totalRows - 1, c + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (showCustom && cursor === 0 && results.length === 0) {
                choose(customSymbol);
                return;
            }
            const idx = showCustom ? cursor - 1 : cursor;
            const pick = results[idx];
            if (pick) choose(pick.symbol, { name: pick.name, type: pick.type });
            else if (customSymbol) choose(customSymbol);
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const showRecent = open && query.trim().length === 0 && recent.length > 0;

    return (
        <div className="relative" ref={ref} data-testid="ticker-selector">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                data-testid="ticker-selector-trigger"
                className="flex items-center gap-2 px-3 py-2 border bg-[#0F0F0F] transition-colors"
                style={{ borderColor: `${accent}55` }}
                title="Strumento attivo globale"
            >
                <Activity size={13} strokeWidth={1.7} style={{ color: accent }} />
                <span className="hidden sm:flex flex-col items-start leading-none">
                    <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-0.5">
                        Ticker
                    </span>
                    <span
                        className="text-[11px] font-mono uppercase tracking-[0.18em]"
                        style={{ color: accent }}
                    >
                        {symbol}
                    </span>
                </span>
                <span
                    className="sm:hidden text-[11px] font-mono uppercase tracking-[0.18em]"
                    style={{ color: accent }}
                >
                    {symbol}
                </span>
                <ChevronDown
                    size={13}
                    strokeWidth={1.7}
                    className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open && (
                <div
                    role="listbox"
                    className="absolute right-0 top-full mt-2 z-[70] w-80 border border-[#2A3550] bg-[#0A0F1C]"
                    style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.85)" }}
                >
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1B2335]">
                        <Search size={13} strokeWidth={1.7} className="text-slate-600 shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setCursor(0);
                                setError(null);
                            }}
                            onKeyDown={onKeyDown}
                            spellCheck={false}
                            autoComplete="off"
                            placeholder="Cerca ticker Yahoo (AAPL, BTC-USD, SPY…)"
                            data-testid="ticker-selector-input"
                            className="bg-transparent w-full outline-none border-0 text-[12px] font-mono uppercase tracking-wider text-white placeholder:text-slate-700 placeholder:normal-case placeholder:tracking-normal"
                        />
                    </div>

                    {error && (
                        <div className="px-3 py-2 text-[11px] font-mono text-[#FF9AA5] border-b border-[#1B2335]">
                            {error}
                        </div>
                    )}

                    {showRecent && (
                        <div className="px-3 py-2 border-b border-[#1B2335]">
                            <div className="flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-2">
                                <Clock size={10} /> Recenti
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {recent.map((sym) => (
                                    <button
                                        key={sym}
                                        type="button"
                                        onClick={() => choose(sym)}
                                        className="px-2 py-1 text-[10px] font-mono border border-[#1B2335] text-slate-300 hover:border-[#2A3550] hover:text-white"
                                    >
                                        {sym}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="max-h-72 overflow-y-auto">
                        {showCustom && (
                            <button
                                type="button"
                                role="option"
                                onMouseEnter={() => setCursor(0)}
                                onClick={() => choose(customSymbol)}
                                data-testid="ticker-option-custom"
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-l-2 transition-colors"
                                style={{
                                    borderColor: cursor === 0 ? accent : "transparent",
                                    background: cursor === 0 ? "rgba(255,255,255,0.04)" : "transparent",
                                }}
                            >
                                <CornerDownLeft size={13} className="text-[#00E5C0] shrink-0" />
                                <span className="flex-1 min-w-0">
                                    <span className="text-[12px] font-mono font-medium text-[#00E5C0] tracking-wide">
                                        Usa {customSymbol}
                                    </span>
                                    <span className="block text-[10px] font-mono text-slate-600">
                                        Simbolo personalizzato · Yahoo Finance
                                    </span>
                                </span>
                            </button>
                        )}

                        {searching && (
                            <div className="px-3 py-3 text-[11px] font-mono text-slate-600">
                                Ricerca…
                            </div>
                        )}

                        {!searching && results.length === 0 && !showCustom && query.trim().length > 0 && (
                            <div className="px-3 py-4 text-[11px] font-mono text-slate-600 text-center">
                                Nessun risultato — premi ⏎ per usare {customSymbol || "il simbolo digitato"}
                            </div>
                        )}

                        {results.map((t, i) => {
                            const row = showCustom ? i + 1 : i;
                            const active = t.symbol === symbol;
                            const highlighted = row === cursor;
                            const acc = tickerAccent({ assetClass: t.type });
                            return (
                                <button
                                    key={`${t.symbol}-${i}`}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onMouseEnter={() => setCursor(row)}
                                    onClick={() => choose(t.symbol, { name: t.name, type: t.type })}
                                    data-testid={`ticker-option-${t.symbol}`}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-l-2 transition-colors"
                                    style={{
                                        borderColor: active ? acc : "transparent",
                                        background: highlighted
                                            ? "rgba(255,255,255,0.04)"
                                            : active
                                              ? `${acc}0D`
                                              : "transparent",
                                    }}
                                >
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: acc }} />
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="text-[12px] font-mono font-medium tracking-wide"
                                                style={{ color: active ? acc : "#CBD5E1" }}
                                            >
                                                {t.symbol}
                                            </span>
                                            <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-600 border border-[#1B2335] px-1 py-0.5">
                                                {t.type}
                                            </span>
                                        </span>
                                        <span className="block text-[10px] font-mono text-slate-600 truncate">
                                            {t.name}
                                        </span>
                                    </span>
                                    {active && symbol === t.symbol && lastPrice != null && (
                                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                            {lastPrice >= 100 ? lastPrice.toFixed(2) : lastPrice.toFixed(3)}
                                        </span>
                                    )}
                                    {active && <Check size={13} strokeWidth={2} style={{ color: acc }} />}
                                </button>
                            );
                        })}
                    </div>

                    <div className="px-3 py-2 border-t border-[#1B2335] text-[8px] font-mono uppercase tracking-[0.25em] text-slate-700">
                        Yahoo Finance · ↑↓ naviga · ⏎ seleziona
                    </div>
                </div>
            )}
        </div>
    );
};

export default TickerSelector;
