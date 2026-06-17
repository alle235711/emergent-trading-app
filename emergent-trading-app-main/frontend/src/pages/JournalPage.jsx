/**
 * JournalPage — Analysis journal with auto-snapshots + manual notes.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
} from "recharts";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "../components/quant/shared/primitives";
import { SafeChart } from "../components/quant/shared/ChartErrorBoundary";
import {
    listJournalEntries,
    getJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    exportJournalJson,
    exportJournalCsv,
} from "../lib/api";

const NEUTRAL = "#94A3B8";
const MODELS = ["sheaf", "clique", "affine", "hodge", "quantum"];

const TRIGGER_COLORS = {
    manual: "#4F8BFF",
    alert: "#FFB020",
    auto_threshold: "#A78BFA",
};

const JournalPage = () => {
    const [entries, setEntries] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);

    const [filterTicker, setFilterTicker] = useState("");
    const [filterTrigger, setFilterTrigger] = useState("");
    const [filterTag, setFilterTag] = useState("");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");

    const [note, setNote] = useState("");
    const [tags, setTags] = useState("");
    const [outcome, setOutcome] = useState("");
    const [saving, setSaving] = useState(false);

    const loadList = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterTicker) params.ticker = filterTicker;
            if (filterTrigger) params.trigger = filterTrigger;
            if (filterTag) params.tag = filterTag;
            if (filterDateFrom) params.date_from = filterDateFrom;
            if (filterDateTo) params.date_to = filterDateTo;
            const res = await listJournalEntries(params);
            setEntries(res.entries || []);
        } catch (err) {
            toast.error("Errore caricamento journal");
        } finally {
            setLoading(false);
        }
    }, [filterTicker, filterTrigger, filterTag, filterDateFrom, filterDateTo]);

    useEffect(() => {
        loadList();
    }, [loadList]);

    const loadDetail = useCallback(async (id) => {
        try {
            const res = await getJournalEntry(id);
            const e = res.entry;
            setDetail(e);
            setNote(e.note || "");
            setTags((e.tags || []).join(", "));
            setOutcome(e.outcome || "");
        } catch {
            toast.error("Errore caricamento entry");
        }
    }, []);

    useEffect(() => {
        if (selectedId) loadDetail(selectedId);
    }, [selectedId, loadDetail]);

    const radarData = useMemo(() => {
        const sigs = detail?.convergence_snapshot?.signals;
        if (!sigs) return [];
        return MODELS.map((k) => ({
            model: k.charAt(0).toUpperCase() + k.slice(1),
            score: sigs[k]?.raw ?? 0,
        }));
    }, [detail]);

    const handleSave = async () => {
        if (!selectedId) return;
        setSaving(true);
        try {
            const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
            await updateJournalEntry(selectedId, { note, tags: tagList, outcome: outcome || null });
            toast.success("Entry aggiornata");
            loadList();
            loadDetail(selectedId);
        } catch {
            toast.error("Errore salvataggio");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedId || !window.confirm("Eliminare questa entry?")) return;
        try {
            await deleteJournalEntry(selectedId);
            toast.success("Entry eliminata");
            setSelectedId(null);
            setDetail(null);
            loadList();
        } catch {
            toast.error("Errore eliminazione");
        }
    };

    const handleExportJson = async () => {
        try {
            const res = await exportJournalJson(filterTicker || undefined);
            const blob = new Blob([JSON.stringify(res.entries, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "journal_export.json";
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Errore export JSON");
        }
    };

    const handleExportCsv = async () => {
        try {
            const csv = await exportJournalCsv(filterTicker || undefined);
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "journal_export.csv";
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Errore export CSV");
        }
    };

    const notePreview = (text) => {
        const s = text || "";
        return s.length > 80 ? `${s.slice(0, 80)}…` : s;
    };

    return (
        <div data-testid="journal-page">
            <PageHeader
                kicker="Account"
                title="Journal"
                accent="Analisi"
                description="Storico snapshot di convergenza, alert automatici e note manuali."
                actions={
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleExportJson}
                            className="flex items-center gap-1 px-3 py-2 border border-[#1B2335] text-[10px] font-mono uppercase text-slate-400 hover:text-white"
                        >
                            <Download size={12} /> Esporta JSON
                        </button>
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            className="flex items-center gap-1 px-3 py-2 border border-[#1B2335] text-[10px] font-mono uppercase text-slate-400 hover:text-white"
                        >
                            <Download size={12} /> Esporta CSV
                        </button>
                    </div>
                }
            />

            {/* Filter bar */}
            <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <input
                    placeholder="Ticker"
                    value={filterTicker}
                    onChange={(e) => setFilterTicker(e.target.value.toUpperCase())}
                    className="bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[11px] font-mono text-slate-300"
                />
                <select
                    value={filterTrigger}
                    onChange={(e) => setFilterTrigger(e.target.value)}
                    className="bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[11px] font-mono text-slate-300"
                >
                    <option value="">Tutti i trigger</option>
                    <option value="manual">manual</option>
                    <option value="alert">alert</option>
                    <option value="auto_threshold">auto_threshold</option>
                </select>
                <input
                    placeholder="Tag"
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[11px] font-mono text-slate-300"
                />
                <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[11px] font-mono text-slate-300"
                />
                <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[11px] font-mono text-slate-300"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-[500px]">
                {/* List 40% */}
                <div className="lg:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {loading && (
                        <p className="text-[11px] font-mono text-slate-600">Caricamento…</p>
                    )}
                    {!loading && entries.length === 0 && (
                        <p className="text-[11px] font-mono text-slate-600">Nessuna entry</p>
                    )}
                    {entries.map((e) => (
                        <button
                            key={e.id}
                            type="button"
                            onClick={() => setSelectedId(e.id)}
                            className={`w-full text-left border p-4 transition-colors ${
                                selectedId === e.id
                                    ? "border-[#00E5C0]/50 bg-[#00E5C0]/[0.04]"
                                    : "border-[#1B2335] bg-[#0E1422] hover:border-slate-600"
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[11px] font-mono text-slate-500">{e.created_at}</span>
                                <span
                                    className="text-[9px] font-mono uppercase px-1.5 py-0.5 border"
                                    style={{
                                        color: TRIGGER_COLORS[e.trigger] || "#94A3B8",
                                        borderColor: `${TRIGGER_COLORS[e.trigger] || "#94A3B8"}55`,
                                    }}
                                >
                                    {e.trigger}
                                </span>
                            </div>
                            <div className="text-sm font-mono text-slate-200">{e.ticker}</div>
                            <div className="text-[10px] font-mono text-slate-500 mt-1">
                                σ = {e.convergence_score?.toFixed(3) ?? "—"}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-2">{notePreview(e.note)}</p>
                        </button>
                    ))}
                </div>

                {/* Detail 60% */}
                <div className="lg:col-span-3">
                    {detail ? (
                        <Panel title={`Entry · ${detail.ticker}`} bodyClassName="space-y-6">
                            <SafeChart height={260}>
                                <ResponsiveContainer width="100%" height={260}>
                                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                                        <PolarGrid stroke="#1B2335" />
                                        <PolarAngleAxis
                                            dataKey="model"
                                            tick={{ fill: "#64748B", fontSize: 10 }}
                                        />
                                        <PolarRadiusAxis domain={[0, 1]} tick={{ fill: "#475569", fontSize: 9 }} />
                                        <Radar
                                            dataKey="score"
                                            stroke={NEUTRAL}
                                            fill={NEUTRAL}
                                            fillOpacity={0.2}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </SafeChart>

                            <div className="grid grid-cols-5 gap-2">
                                {MODELS.map((k) => {
                                    const sig = detail.convergence_snapshot?.signals?.[k];
                                    return (
                                        <div key={k} className="border border-[#1B2335] p-2 text-center">
                                            <div className="text-[9px] font-mono uppercase text-slate-600">{k}</div>
                                            <div className="text-sm font-mono text-slate-300">
                                                {sig?.raw?.toFixed(3) ?? "—"}
                                            </div>
                                            <div className="text-[9px] text-slate-500">{sig?.label}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div>
                                <label className="text-[10px] font-mono uppercase text-slate-500">Nota</label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={4}
                                    className="w-full mt-1 bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm text-slate-300 font-mono"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-mono uppercase text-slate-500">Outcome</label>
                                    <select
                                        value={outcome}
                                        onChange={(e) => setOutcome(e.target.value)}
                                        className="w-full mt-1 bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm text-slate-300"
                                    >
                                        <option value="">—</option>
                                        <option value="Confermato">Confermato</option>
                                        <option value="Sbagliato">Sbagliato</option>
                                        <option value="Neutro">Neutro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-mono uppercase text-slate-500">Tags</label>
                                    <input
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                        placeholder="comma separated"
                                        className="w-full mt-1 bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm text-slate-300 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    data-testid="journal-save-btn"
                                    className="px-4 py-2 border border-[#00E5C0]/50 text-[10px] font-mono uppercase text-[#00E5C0] hover:bg-[#00E5C0]/10"
                                >
                                    {saving ? "Salvataggio…" : "Salva"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="flex items-center gap-1 px-4 py-2 border border-[#FF4D5E]/40 text-[10px] font-mono uppercase text-[#FF4D5E]"
                                >
                                    <Trash2 size={12} /> Elimina
                                </button>
                            </div>
                        </Panel>
                    ) : (
                        <Panel title="Dettaglio entry">
                            <p className="text-[11px] font-mono text-slate-600">
                                Seleziona un&apos;entry dalla lista
                            </p>
                        </Panel>
                    )}
                </div>
            </div>
        </div>
    );
};

export default JournalPage;
