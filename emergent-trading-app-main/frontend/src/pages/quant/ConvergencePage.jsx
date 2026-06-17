/**
 * ConvergencePage — Multi-model signal synthesis (interpretation layer).
 * Reads all 5 models simultaneously; NEVER makes trading recommendations.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
} from "recharts";
import { Camera, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel, StatusBadge } from "../../components/quant/shared/primitives";
import { SafeChart } from "../../components/quant/shared/ChartErrorBoundary";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { fetchConvergence, createJournalEntry } from "../../lib/api";

const MODELS = [
    { key: "sheaf", name: "Sheaf Cohomology" },
    { key: "clique", name: "Clique Homology" },
    { key: "affine", name: "Affine Scheme" },
    { key: "hodge", name: "Hodge Decomposition" },
    { key: "quantum", name: "Quantum Graph" },
];

const NEUTRAL = "#94A3B8";

const NeutralGauge = ({ value = 0, label }) => {
    const v = Math.max(0, Math.min(1, value ?? 0));
    const pct = `${(v * 100).toFixed(0)}%`;
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="w-full h-2 bg-[#1B2335] relative">
                <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${v * 100}%`, background: NEUTRAL }}
                />
            </div>
            <span className="text-lg font-mono text-slate-300">{pct}</span>
            {label && (
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                    {label}
                </span>
            )}
        </div>
    );
};

const ConvergencePage = () => {
    const { symbol } = useTicker();
    const { horizon } = useHorizon();
    const [searchParams] = useSearchParams();
    const ticker = (searchParams.get("ticker") || symbol || "SPY").toUpperCase();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [localHorizon, setLocalHorizon] = useState(horizon);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchConvergence(ticker, { days: 90, horizon: localHorizon });
            setData(res);
        } catch (err) {
            setError(err?.response?.data?.detail || err.message || "Errore caricamento");
        } finally {
            setLoading(false);
        }
    }, [ticker, localHorizon]);

    useEffect(() => {
        load();
    }, [load]);

    const radarData = useMemo(() => {
        if (!data?.signals) return [];
        return MODELS.map((m) => ({
            model: m.name.split(" ")[0],
            score: data.signals[m.key]?.raw ?? 0,
            fullMark: 1,
        }));
    }, [data]);

    const handleSaveSnapshot = async () => {
        setSaving(true);
        try {
            await createJournalEntry({
                ticker,
                horizon: localHorizon,
                trigger: "manual",
                note: `Snapshot manuale — convergenza ${data?.convergence_label ?? "N/A"}`,
                tags: ["snapshot"],
                include_snapshot: true,
            });
            toast.success("Snapshot salvato nel journal");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Errore salvataggio");
        } finally {
            setSaving(false);
        }
    };

    const agreeText =
        data?.convergence_label === "LOW"
            ? "I modelli concordano"
            : data?.convergence_label === "HIGH"
              ? "I modelli divergono"
              : "I modelli parzialmente allineati";

    return (
        <div data-testid="convergence-page">
            <PageHeader
                kicker="Sintesi modelli"
                title="Convergenza"
                accent="Segnali"
                description="Lettura simultanea dei 5 modelli geometrici. Nessuna raccomandazione operativa — interpreta tu i risultati."
                actions={
                    <div className="flex items-center gap-2">
                        <select
                            value={localHorizon}
                            onChange={(e) => setLocalHorizon(e.target.value)}
                            className="bg-[#0A0F1C] border border-[#1B2335] text-[11px] font-mono uppercase tracking-wider px-3 py-2 text-slate-300"
                        >
                            <option value="short">Short</option>
                            <option value="medium">Medium</option>
                            <option value="long">Long</option>
                        </select>
                        <button
                            type="button"
                            onClick={load}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-2 border border-[#1B2335] text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-white"
                        >
                            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                            Aggiorna
                        </button>
                    </div>
                }
            />

            <div className="mb-6 flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-500">
                <span>
                    Ticker: <strong className="text-slate-200">{ticker}</strong>
                </span>
                {data?.timestamp && (
                    <span>
                        Timestamp: <strong className="text-slate-200">{data.timestamp}</strong>
                    </span>
                )}
                {data && (
                    <StatusBadge status="live" />
                )}
                {data && (
                    <span>
                        Modelli: {data.models_available}/5
                        {data.models_failed > 0 && (
                            <span className="text-[#FF4D5E] ml-1">({data.models_failed} errori)</span>
                        )}
                    </span>
                )}
            </div>

            {error && (
                <div className="mb-6 border border-[#FF4D5E]/40 bg-[#FF4D5E]/10 px-4 py-3 text-sm text-[#FF4D5E]">
                    {error}
                </div>
            )}

            {/* 5 model cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                {MODELS.map((m) => {
                    const sig = data?.signals?.[m.key];
                    return (
                        <Panel
                            key={m.key}
                            title={m.name}
                            testId={`convergence-card-${m.key}`}
                            bodyClassName="space-y-3"
                        >
                            {sig?.raw != null ? (
                                <>
                                    <NeutralGauge value={sig.raw} label={sig.label} />
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        {sig.description}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[11px] font-mono text-slate-600">
                                    {sig?.description || "—"}
                                </p>
                            )}
                        </Panel>
                    );
                })}
            </div>

            {/* Radar chart */}
            <Panel title="Radar — 5 modelli" className="mb-8">
                <SafeChart height={320}>
                    <ResponsiveContainer width="100%" height={320}>
                        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                            <PolarGrid stroke="#1B2335" />
                            <PolarAngleAxis
                                dataKey="model"
                                tick={{ fill: "#64748B", fontSize: 10, fontFamily: "monospace" }}
                            />
                            <PolarRadiusAxis
                                domain={[0, 1]}
                                tick={{ fill: "#475569", fontSize: 9 }}
                                axisLine={false}
                            />
                            <Radar
                                name="Score"
                                dataKey="score"
                                stroke={NEUTRAL}
                                fill={NEUTRAL}
                                fillOpacity={0.25}
                                strokeWidth={2}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </SafeChart>
            </Panel>

            {/* Convergence bar */}
            <Panel title="Convergence score" className="mb-8">
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-slate-300">{agreeText}</span>
                        <span className="font-mono text-slate-400">
                            σ = {data?.convergence_score?.toFixed(3) ?? "—"}{" "}
                            <span className="text-slate-600">({data?.convergence_label})</span>
                        </span>
                    </div>
                    <div className="w-full h-3 bg-[#1B2335]">
                        <div
                            className="h-full transition-all"
                            style={{
                                width: `${Math.min(100, (data?.convergence_score ?? 0) * 200)}%`,
                                background: NEUTRAL,
                            }}
                        />
                    </div>
                    <p className="text-[11px] text-slate-600 italic">
                        Questo non è un segnale operativo — interpreta tu i modelli sopra
                    </p>
                </div>
            </Panel>

            <button
                type="button"
                onClick={handleSaveSnapshot}
                disabled={saving || !data}
                data-testid="save-snapshot-btn"
                className="flex items-center gap-2 px-5 py-3 border border-[#1B2335] bg-[#0A0F1C] text-[11px] font-mono uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40"
            >
                <Camera size={14} />
                {saving ? "Salvataggio…" : "📸 Salva snapshot nel journal"}
            </button>
        </div>
    );
};

export default ConvergencePage;
