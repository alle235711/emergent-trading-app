import React, { useState, useRef, useEffect } from "react";
import { Calendar } from "lucide-react";

// Periodi predefiniti — dal più corto al più lungo
const PERIODS = [
    { key: "1d",  label: "1D",  group: "intra" },
    { key: "5d",  label: "5D",  group: "intra" },
    { key: "1mo", label: "1M",  group: "short" },
    { key: "3mo", label: "3M",  group: "short" },
    { key: "6mo", label: "6M",  group: "short" },
    { key: "1y",  label: "1Y",  group: "long"  },
    { key: "2y",  label: "2Y",  group: "long"  },
    { key: "5y",  label: "5Y",  group: "long"  },
    { key: "max", label: "MAX", group: "long"  },
];

/**
 * PeriodSelector — segmented control + custom date range picker.
 *
 * Props:
 *   value     — periodo corrente (es. "2y" o "custom:2024-01-01:2025-01-01")
 *   onChange  — callback(newPeriod: string)
 *   disabled  — bool
 */
export const PeriodSelector = ({ value, onChange, disabled = false }) => {
    const [showPicker, setShowPicker]   = useState(false);
    const [startDate, setStartDate]     = useState("");
    const [endDate, setEndDate]         = useState("");
    const [pickerError, setPickerError] = useState("");
    const pickerRef = useRef(null);

    // Chiudi il picker cliccando fuori
    useEffect(() => {
        const handler = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setShowPicker(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Determina se il valore corrente è un periodo predefinito o custom
    const isCustom  = value?.startsWith("custom:");
    const activeKey = isCustom ? "custom" : value;

    const handleCustomApply = () => {
        setPickerError("");
        if (!startDate || !endDate) {
            setPickerError("Seleziona entrambe le date");
            return;
        }
        const s = new Date(startDate);
        const e = new Date(endDate);
        const today = new Date();

        if (s >= e) {
            setPickerError("La data iniziale deve precedere quella finale");
            return;
        }
        if (e > today) {
            setPickerError("La data finale non può essere nel futuro");
            return;
        }
        // Differenza minima: 5 giorni (per avere abbastanza dati S/R)
        const diffDays = (e - s) / (1000 * 60 * 60 * 24);
        if (diffDays < 5) {
            setPickerError("Intervallo minimo: 5 giorni");
            return;
        }

        onChange(`custom:${startDate}:${endDate}`);
        setShowPicker(false);
    };

    // Calcola label del periodo custom per mostrarlo nel bottone
    const customLabel = () => {
        if (!isCustom) return "CUSTOM";
        const [, s, e] = value.split(":");
        const fmt = (d) => {
            const [y, m, day] = d.split("-");
            return `${day}/${m}/${y.slice(2)}`;
        };
        return `${fmt(s)} → ${fmt(e)}`;
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Bottoni periodi predefiniti */}
            <div
                className="inline-flex border border-[#222222] bg-[#0F0F0F]"
                data-testid="period-selector"
                role="tablist"
            >
                {PERIODS.map((p, idx) => {
                    const active = p.key === activeKey;
                    // Separatore visivo tra gruppi
                    const prevGroup = idx > 0 ? PERIODS[idx - 1].group : null;
                    const groupBreak = prevGroup && prevGroup !== p.group;

                    return (
                        <button
                            key={p.key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            disabled={disabled}
                            onClick={() => {
                                setShowPicker(false);
                                onChange(p.key);
                            }}
                            data-testid={`time-selector-${p.key}`}
                            className={[
                                "px-3 py-2 text-xs font-mono tracking-[0.2em] transition-all duration-150 ease-out",
                                groupBreak
                                    ? "border-l-2 border-l-[#333] border-r border-r-[#222222]"
                                    : "border-r border-[#222222]",
                                "last:border-r-0",
                                active
                                    ? "text-[#00E5C0] bg-black"
                                    : "text-neutral-500 hover:text-white",
                                disabled ? "opacity-50 cursor-not-allowed" : "",
                            ].join(" ")}
                        >
                            {p.label}
                        </button>
                    );
                })}
            </div>

            {/* Bottone custom date picker */}
            <div className="relative" ref={pickerRef}>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setShowPicker((v) => !v)}
                    className={[
                        "inline-flex items-center gap-2 px-3 py-2 text-xs font-mono tracking-[0.2em]",
                        "border transition-all duration-150",
                        isCustom || showPicker
                            ? "border-[#00E5C0]/60 text-[#00E5C0] bg-black"
                            : "border-[#222222] text-neutral-500 hover:text-white bg-[#0F0F0F]",
                        disabled ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                >
                    <Calendar size={11} strokeWidth={1.5} />
                    <span>{customLabel()}</span>
                </button>

                {/* Dropdown picker */}
                {showPicker && (
                    <div
                        className="absolute right-0 top-full mt-2 z-50 border border-[#333] bg-[#0A0A0A] p-4 w-72"
                        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}
                    >
                        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-4">
                            // Custom Date Range
                        </div>

                        <div className="space-y-3">
                            {/* Data inizio */}
                            <div>
                                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 block mb-1.5">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    max={endDate || new Date().toISOString().split("T")[0]}
                                    onChange={(e) => {
                                        setStartDate(e.target.value);
                                        setPickerError("");
                                    }}
                                    className={[
                                        "w-full bg-[#111] border border-[#333] text-white",
                                        "font-mono text-xs px-3 py-2",
                                        "focus:outline-none focus:border-[#00E5C0]/50",
                                        "[color-scheme:dark]",
                                    ].join(" ")}
                                />
                            </div>

                            {/* Data fine */}
                            <div>
                                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 block mb-1.5">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    min={startDate}
                                    max={new Date().toISOString().split("T")[0]}
                                    onChange={(e) => {
                                        setEndDate(e.target.value);
                                        setPickerError("");
                                    }}
                                    className={[
                                        "w-full bg-[#111] border border-[#333] text-white",
                                        "font-mono text-xs px-3 py-2",
                                        "focus:outline-none focus:border-[#00E5C0]/50",
                                        "[color-scheme:dark]",
                                    ].join(" ")}
                                />
                            </div>

                            {/* Shortcut rapidi */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {[
                                    { label: "1W",  days: 7   },
                                    { label: "2W",  days: 14  },
                                    { label: "1M",  days: 30  },
                                    { label: "3M",  days: 90  },
                                    { label: "6M",  days: 180 },
                                    { label: "YTD", days: null },
                                ].map(({ label, days }) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => {
                                            const today = new Date();
                                            const end   = today.toISOString().split("T")[0];
                                            let start;
                                            if (days === null) {
                                                // YTD
                                                start = `${today.getFullYear()}-01-01`;
                                            } else {
                                                const s = new Date(today);
                                                s.setDate(s.getDate() - days);
                                                start = s.toISOString().split("T")[0];
                                            }
                                            setStartDate(start);
                                            setEndDate(end);
                                            setPickerError("");
                                        }}
                                        className="text-[10px] font-mono px-2 py-1 border border-[#333] text-neutral-400 hover:border-[#00E5C0]/40 hover:text-[#00E5C0] transition-colors"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Errore validazione */}
                            {pickerError && (
                                <div className="text-[10px] font-mono text-[#FF3B30] pt-1">
                                    ⚠ {pickerError}
                                </div>
                            )}

                            {/* Apply */}
                            <button
                                type="button"
                                onClick={handleCustomApply}
                                className="w-full mt-1 py-2 text-xs font-mono uppercase tracking-[0.2em] border border-[#00E5C0]/40 text-[#00E5C0] hover:bg-[#00E5C0]/5 transition-colors"
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PeriodSelector;