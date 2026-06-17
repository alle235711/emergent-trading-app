import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Clock, Calendar, Play } from "lucide-react";

import { useHorizon } from "../../context/HorizonContext";
import { HORIZON_OPTIONS, HORIZON_PROFILES } from "../../lib/horizon";

/**
 * HorizonSelector — the GLOBAL investment-horizon dropdown.
 *
 * Shows a day-count badge on the trigger button. The dropdown exposes, for
 * each period, a slider + numeric input that update `pendingRanges` (visual
 * preview only). Clicking "Applica" (or pressing Enter) calls `commitRanges()`
 * which bumps `rangeToken` and causes every chart page to re-generate data
 * with the new observation window.
 */
const HorizonSelector = () => {
    const {
        horizon,
        setHorizon,
        profile,
        pendingRanges,
        customRanges,
        setPendingRange,
        commitRanges,
        hasPendingChanges,
    } = useHorizon();

    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click.
    useEffect(() => {
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    // Enter key confirms pending ranges while dropdown is open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Enter") { commitRanges(); setOpen(false); }
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, commitRanges]);

    const choose = (id) => {
        setHorizon(id);
        // Keep panel open so user can adjust the range immediately.
    };

    const handleApplica = () => {
        commitRanges();
        setOpen(false);
    };

    const committedDays = customRanges[horizon];

    return (
        <div className="relative" ref={ref} data-testid="horizon-selector">
            {/* ── Trigger button ── */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex items-center gap-2 px-3 py-2 border bg-[#0F0F0F] transition-colors"
                style={{ borderColor: `${profile.accent}55` }}
                title="Orizzonte temporale globale"
            >
                <Clock size={13} strokeWidth={1.7} style={{ color: profile.accent }} />

                <span className="hidden sm:flex flex-col items-start leading-none">
                    <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-0.5">
                        Orizzonte
                    </span>
                    <span
                        className="text-[11px] font-mono uppercase tracking-[0.18em]"
                        style={{ color: profile.accent }}
                    >
                        {profile.label}
                    </span>
                </span>

                {/* Committed day-count badge */}
                <span
                    className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono"
                    style={{
                        background: `${profile.accent}1A`,
                        color: profile.accent,
                        border: `1px solid ${profile.accent}44`,
                    }}
                >
                    <Calendar size={8} strokeWidth={1.8} />
                    {committedDays}&nbsp;GG
                </span>

                {/* Pending-changes dot */}
                {hasPendingChanges && (
                    <span
                        className="hidden sm:block w-1.5 h-1.5 rounded-full"
                        style={{ background: profile.accent }}
                        title="Modifiche non applicate"
                    />
                )}

                <span
                    className="sm:hidden text-[11px] font-mono uppercase tracking-[0.18em]"
                    style={{ color: profile.accent }}
                >
                    {profile.tag}
                </span>

                <ChevronDown
                    size={13}
                    strokeWidth={1.7}
                    className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>

            {/* ── Dropdown panel ── */}
            {open && (
                <div
                    role="listbox"
                    className="absolute right-0 top-full mt-2 z-[70] w-76 border border-[#2A3550] bg-[#0A0F1C]"
                    style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.85)", width: "310px" }}
                >
                    <div className="px-3 py-2.5 border-b border-[#1B2335] text-[9px] font-mono uppercase tracking-[0.3em] text-slate-600">
                        // Regime temporale · Giorni di osservazione
                    </div>

                    {HORIZON_OPTIONS.map((opt) => {
                        const active = opt.id === horizon;
                        const p = HORIZON_PROFILES[opt.id];
                        const pending = pendingRanges[opt.id];
                        const committed = customRanges[opt.id];
                        const isDirty = pending !== committed;
                        const pct = ((pending - p.rangeMin) / (p.rangeMax - p.rangeMin)) * 100;

                        return (
                            <div
                                key={opt.id}
                                className="border-b border-[#111927] last:border-0"
                            >
                                {/* Option row */}
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => choose(opt.id)}
                                    data-testid={`horizon-option-${opt.id}`}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-l-2 transition-colors hover:bg-white/[0.03]"
                                    style={{
                                        borderColor: active ? opt.accent : "transparent",
                                        background: active ? `${opt.accent}0D` : "transparent",
                                    }}
                                >
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ background: opt.accent }}
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span
                                            className="block text-[12px] font-medium"
                                            style={{ color: active ? opt.accent : "#CBD5E1" }}
                                        >
                                            {opt.label}
                                        </span>
                                        <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-600">
                                            {opt.sub} · {p.rangeMin}–{p.rangeMax}&nbsp;gg
                                        </span>
                                    </span>

                                    {/* Committed/pending badge */}
                                    <span
                                        className="text-[9px] font-mono px-1.5 py-0.5 shrink-0 flex items-center gap-1"
                                        style={{
                                            background: isDirty
                                                ? `${opt.accent}22`
                                                : `${opt.accent}15`,
                                            color: isDirty ? opt.accent : `${opt.accent}CC`,
                                            border: `1px solid ${isDirty ? opt.accent + "66" : opt.accent + "33"}`,
                                        }}
                                    >
                                        {isDirty && (
                                            <span
                                                className="w-1 h-1 rounded-full"
                                                style={{ background: opt.accent }}
                                            />
                                        )}
                                        {isDirty ? `${pending} gg` : `${committed} gg`}
                                    </span>

                                    {active && (
                                        <Check size={14} strokeWidth={2} style={{ color: opt.accent }} />
                                    )}
                                </button>

                                {/* Range editor */}
                                <div
                                    className="px-3 pb-3 pt-0.5 border-l-2"
                                    style={{
                                        borderColor: active ? opt.accent : "transparent",
                                        background: active ? `${opt.accent}06` : "transparent",
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-[8px] font-mono text-slate-700 w-5 shrink-0"
                                        >
                                            {p.rangeMin}
                                        </span>
                                        <input
                                            type="range"
                                            min={p.rangeMin}
                                            max={p.rangeMax}
                                            step={1}
                                            value={pending}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) =>
                                                setPendingRange(opt.id, Number(e.target.value))
                                            }
                                            className="flex-1 h-[3px] appearance-none rounded-none cursor-pointer"
                                            style={{
                                                accentColor: opt.accent,
                                                background: `linear-gradient(to right, ${opt.accent} ${pct}%, #1B2335 ${pct}%)`,
                                            }}
                                        />
                                        <span
                                            className="text-[8px] font-mono text-slate-700 w-5 text-right shrink-0"
                                        >
                                            {p.rangeMax}
                                        </span>
                                        <input
                                            type="number"
                                            min={p.rangeMin}
                                            max={p.rangeMax}
                                            value={pending}
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") { e.preventDefault(); handleApplica(); }
                                            }}
                                            onChange={(e) =>
                                                setPendingRange(opt.id, Number(e.target.value))
                                            }
                                            className="w-12 text-center text-[10px] font-mono bg-[#0F1623] border border-[#2A3550] px-1 py-0.5 outline-none focus:border-current"
                                            style={{ color: opt.accent }}
                                        />
                                        <span className="text-[8px] font-mono text-slate-700">gg</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Footer — Applica / chiudi */}
                    <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                        <span className="text-[8px] font-mono text-slate-700 uppercase tracking-[0.2em]">
                            // Premi Applica per aggiornare i grafici
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600 hover:text-slate-400 transition-colors px-2 py-1"
                            >
                                annulla
                            </button>
                            <button
                                type="button"
                                onClick={handleApplica}
                                className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.2em] px-2.5 py-1 transition-colors"
                                style={{
                                    background: hasPendingChanges
                                        ? `${profile.accent}22`
                                        : "#1B2335",
                                    color: hasPendingChanges ? profile.accent : "#4B5563",
                                    border: `1px solid ${hasPendingChanges ? profile.accent + "55" : "#2A3550"}`,
                                }}
                                title="Applica le modifiche ai grafici (Invio)"
                            >
                                <Play
                                    size={8}
                                    strokeWidth={2}
                                    fill={hasPendingChanges ? profile.accent : "#4B5563"}
                                />
                                Applica
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HorizonSelector;
