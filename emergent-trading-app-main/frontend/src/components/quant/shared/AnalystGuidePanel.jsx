import React, { useCallback, useEffect, useRef, useState } from "react";
import { Brain, X, AlertTriangle, BookOpen, Layers, Sparkles } from "lucide-react";

import { getGuide } from "../../../lib/analystGuides";
import { HORIZON_ORDER, HORIZON_PROFILES } from "../../../lib/horizon";
import { useHorizon } from "../../../context/HorizonContext";
import { RichText, MathInline } from "./MathText";

/**
 * AnalystGuidePanel
 * ────────────────────────────────────────────────────────────────────────────
 * The reusable "Analyst Insight 🧠" module dropped into every dashboard.
 *
 * Renders a compact control cluster (current-horizon chip + trigger button) and
 * a right-side slide-over that, without cluttering the charts, explains:
 *   1. Traduzione Matematica-Visiva   — cosa si sta guardando (con notazione LaTeX)
 *   2. Come leggere i Segnali di Rischio
 *   3. Strategia Multi-Horizon         — rubrica Breve / Medio / Lungo
 *
 * It is wired to the GLOBAL horizon: switching the horizon from the navbar pops
 * this panel open directly on the matching macro-temporal section.
 *
 * @param {{ model: string, compact?: boolean }} props  `model` selects the guide.
 */
const AnalystGuidePanel = ({ model = "master", compact = false }) => {
    const { horizon, changeToken } = useHorizon();
    const guide = getGuide(model);

    const [open, setOpen] = useState(false);
    const [activeHz, setActiveHz] = useState(horizon);
    const firstRun = useRef(true);

    // Sync the active horizon tab when the global selector changes.
    // Do NOT auto-open the drawer — mounting the slide-over while Recharts
    // reconciles causes insertBefore/removeChild runtime crashes.
    useEffect(() => {
        if (firstRun.current) {
            firstRun.current = false;
            return;
        }
        setActiveHz(horizon);
    }, [changeToken, horizon]);

    const openPanel = useCallback(() => {
        setActiveHz(horizon);
        setOpen(true);
    }, [horizon]);

    // Esc to close + lock body scroll while the drawer is open.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    const hzProfile = HORIZON_PROFILES[activeHz] || HORIZON_PROFILES.medium;

    return (
        <>
            {/* ── Trigger cluster (lives in the page header) ── */}
            <div className="flex items-center gap-2">
                {!compact && <HorizonChip />}
                <button
                    type="button"
                    onClick={openPanel}
                    data-testid={`analyst-insight-btn-${model}`}
                    title="Apri la guida analitica di questa dashboard"
                    className="group flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.2em] border border-[#A78BFA]/45 text-[#C4B5FD] hover:bg-[#A78BFA]/10 hover:text-white transition-colors"
                >
                    <Brain size={14} strokeWidth={1.7} className="text-[#A78BFA]" />
                    Analyst Insight
                    <span aria-hidden className="text-[12px] leading-none">🧠</span>
                </button>
            </div>

            {/* ── Slide-over drawer ── */}
            <div
                className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
                aria-hidden={!open}
            >
                {/* backdrop */}
                <div
                    onClick={() => setOpen(false)}
                    className={`absolute inset-0 bg-black/70 backdrop-blur-[2px] transition-opacity duration-200 ${
                        open ? "opacity-100" : "opacity-0"
                    }`}
                />

                {/* panel */}
                <aside
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Analyst Insight — ${guide.title}`}
                    data-testid={`analyst-insight-panel-${model}`}
                    className={`absolute top-0 right-0 h-full w-full sm:w-[560px] max-w-full bg-[#0A0F1C] border-l border-[#2A3550] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
                        open ? "translate-x-0" : "translate-x-full"
                    }`}
                >
                    {/* header */}
                    <div className="shrink-0 px-6 py-5 border-b border-[#1B2335] bg-[#070B14]">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-[#A78BFA] mb-2">
                                    <Sparkles size={12} strokeWidth={1.7} />
                                    Analyst Insight 🧠
                                </div>
                                <h2 className="text-lg font-medium text-slate-100 leading-tight truncate">
                                    {guide.title}
                                </h2>
                                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600 mt-1">
                                    {guide.kicker}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Chiudi"
                                className="shrink-0 p-2 text-slate-500 hover:text-white border border-[#1B2335] hover:border-[#2A3550] transition-colors"
                            >
                                <X size={16} strokeWidth={1.7} />
                            </button>
                        </div>

                        {/* governing equation */}
                        <div className="mt-4 px-3 py-2.5 border border-[#1B2335] bg-[#0E1422]">
                            <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1.5">
                                Relazione governante
                            </div>
                            <div className="text-[15px] text-slate-200 leading-snug">
                                <MathInline>{guide.equation}</MathInline>
                            </div>
                        </div>
                    </div>

                    {/* scrollable body */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                        {/* 1 · reading */}
                        <GuideSection
                            icon={<BookOpen size={13} strokeWidth={1.7} />}
                            tone="#4F8BFF"
                            title="Traduzione Matematica-Visiva"
                            subtitle="cosa si sta guardando"
                        >
                            <RichText
                                text={guide.reading}
                                className="text-[13px] leading-relaxed text-slate-300"
                            />
                        </GuideSection>

                        {/* 2 · risk */}
                        <GuideSection
                            icon={<AlertTriangle size={13} strokeWidth={1.7} />}
                            tone="#FFB020"
                            title="Segnali di Rischio"
                            subtitle="come individuare il pericolo"
                        >
                            <div className="border border-[#FFB020]/30 bg-[#FFB020]/[0.05] px-4 py-3">
                                <RichText
                                    text={guide.risk}
                                    className="text-[13px] leading-relaxed text-[#FBD38D]"
                                />
                            </div>
                        </GuideSection>

                        {/* 3 · multi-horizon strategy */}
                        <GuideSection
                            icon={<Layers size={13} strokeWidth={1.7} />}
                            tone="#00E5C0"
                            title="Strategia Multi-Horizon"
                            subtitle="rubrica azionabile per orizzonte"
                        >
                            {/* horizon tabs */}
                            <div className="flex border border-[#1B2335] mb-4">
                                {HORIZON_ORDER.map((id) => {
                                    const p = HORIZON_PROFILES[id];
                                    const isActive = id === activeHz;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setActiveHz(id)}
                                            data-testid={`insight-hz-tab-${id}`}
                                            className="flex-1 px-2 py-2 text-[10px] font-mono uppercase tracking-[0.15em] border-r border-[#1B2335] last:border-r-0 transition-colors"
                                            style={
                                                isActive
                                                    ? { color: "#0A0F1C", background: p.accent }
                                                    : { color: "#64748B", background: "transparent" }
                                            }
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* active horizon body */}
                            <div
                                className="border-l-2 pl-4"
                                style={{ borderColor: hzProfile.accent }}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <span
                                        className="text-[9px] font-mono uppercase tracking-[0.25em] px-2 py-0.5 border"
                                        style={{
                                            color: hzProfile.accent,
                                            borderColor: `${hzProfile.accent}55`,
                                            background: `${hzProfile.accent}12`,
                                        }}
                                    >
                                        {hzProfile.tag} · {hzProfile.blurb}
                                    </span>
                                </div>
                                <h4 className="text-[14px] font-medium text-slate-100 mb-2">
                                    {guide.horizons[activeHz].headline}
                                </h4>
                                <RichText
                                    text={guide.horizons[activeHz].body}
                                    className="text-[13px] leading-relaxed text-slate-300"
                                />
                            </div>
                        </GuideSection>
                    </div>

                    {/* footer disclaimer */}
                    <div className="shrink-0 px-6 py-3 border-t border-[#1B2335] bg-[#070B14]">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-700 leading-relaxed">
                            Interpretazione modellistica · non costituisce consulenza
                            finanziaria · rischio di perdita del capitale
                        </p>
                    </div>
                </aside>
            </div>
        </>
    );
};

/** Section wrapper with a coloured kicker. */
const GuideSection = ({ icon, tone, title, subtitle, children }) => (
    <section>
        <div className="flex items-center gap-2 mb-3">
            <span style={{ color: tone }}>{icon}</span>
            <span
                className="text-[10px] font-mono uppercase tracking-[0.25em]"
                style={{ color: tone }}
            >
                {title}
            </span>
            {subtitle ? (
                <span className="text-[10px] font-mono text-slate-600 lowercase tracking-wide">
                    · {subtitle}
                </span>
            ) : null}
        </div>
        {children}
    </section>
);

/**
 * HorizonChip — a small read-only badge reflecting the GLOBAL horizon. Exported
 * so dashboards can show the active regime next to the insight button.
 */
export const HorizonChip = () => {
    const { profile } = useHorizon();
    return (
        <span
            data-testid="horizon-chip"
            className="inline-flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-mono uppercase tracking-[0.18em] border"
            style={{
                color: profile.accent,
                borderColor: `${profile.accent}55`,
                background: `${profile.accent}10`,
            }}
            title={`Orizzonte globale: ${profile.label} (${profile.tag})`}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: profile.accent }}
            />
            {profile.label}
        </span>
    );
};

export default AnalystGuidePanel;
