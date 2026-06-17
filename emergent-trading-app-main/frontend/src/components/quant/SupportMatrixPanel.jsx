import React, { useCallback, useEffect, useState } from "react";
import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from "recharts";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { fetchSupportMatrix } from "../../lib/api";

// ─── Palette ────────────────────────────────────────────────────────────────
const ACCENT   = "#00E5C0";
const DANGER   = "#FF3B30";
const WARN     = "#FFB800";
const GRID_CLR = "#1A1A1A";
const T_LABELS = ["1d", "3d", "5d", "10d", "20d"];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Interpola da verde (#00E5C0) a rosso (#FF3B30) in base al risk score */
function riskColor(score) {
    if (score === null || score === undefined) return "#444";
    const t = Math.max(0, Math.min(1, score));
    const r = Math.round(0x00 + t * (0xFF - 0x00));
    const g = Math.round(0xE5 - t * (0xE5 - 0x3B));
    const b = Math.round(0xC0 - t * (0xC0 - 0x30));
    return `rgb(${r},${g},${b})`;
}

/** Colore cella heatmap per probabilità di rimbalzo p ∈ [0,1] */
function heatColor(p) {
    if (p === null || p === undefined) return "rgba(255,255,255,0.04)";
    // p alto = rimbalzo probabile = verde; p basso = rottura = rosso
    const t = Math.max(0, Math.min(1, p));
    const alpha = 0.15 + t * 0.65;
    if (t >= 0.5) {
        return `rgba(0,229,192,${alpha})`;
    } else {
        return `rgba(255,59,48,${alpha * (1 - t * 1.5)})`;
    }
}

// ─── Tooltip custom per il grafico prezzi con livelli S/R ───────────────────
const SRTooltip = ({ active, payload, label, currency }) => {
    if (!active || !payload?.length) return null;
    return (
        <div
            className="font-mono text-xs px-3 py-2"
            style={{
                background: "rgba(10,10,10,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
            }}
        >
            <div className="text-neutral-500 uppercase tracking-[0.2em] text-[10px] mb-1">
                {label}
            </div>
            <div className="text-[#00E5C0]">
                {Number(payload[0].value).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
                {currency && (
                    <span className="text-neutral-500 ml-2">{currency}</span>
                )}
            </div>
        </div>
    );
};

// ─── Componente principale ───────────────────────────────────────────────────
const SupportMatrixPanel = ({ ticker, period = "2y", currency }) => {
    const [matrixData, setMatrixData] = useState(null);
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState(null);
    const [activeLevel, setActiveLevel] = useState(null);

    const load = useCallback(async () => {
        if (!ticker) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchSupportMatrix(ticker, period, {
                min_touches: 3,
                delta: 0.008,
                B: 500,   // bootstrap ridotto per latenza UI
            });
            setMatrixData(res.result);
        } catch (err) {
            setError(
                err?.response?.data?.detail ||
                err?.message ||
                "Error fetching support matrix"
            );
        } finally {
            setLoading(false);
        }
    }, [ticker, period]);

    useEffect(() => { load(); }, [load]);

    // ── Stato di caricamento ──
    if (loading) {
        return (
            <div className="border border-[#222222] bg-[#0F0F0F] p-6 mt-6">
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-4">
                    // Support · Resistance Matrix
                </div>
                <div className="h-40 flex items-center justify-center">
                    <div className="text-xs font-mono uppercase tracking-[0.3em] text-neutral-500 animate-pulse">
                        Computing probability matrix
                        <span className="ml-1">_</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Errore ──
    if (error) {
        return (
            <div className="border border-[#FF3B30]/40 bg-[#FF3B30]/5 p-4 mt-6 flex items-start gap-3">
                <AlertTriangle size={16} className="text-[#FF3B30] mt-0.5 shrink-0" strokeWidth={1.5} />
                <div className="font-mono text-xs text-[#FF3B30]">
                    <span className="uppercase tracking-[0.2em]">err :: </span>
                    {error}
                </div>
                <button onClick={load} className="ml-auto text-neutral-500 hover:text-white">
                    <RefreshCw size={14} />
                </button>
            </div>
        );
    }

    if (!matrixData) return null;

    const { levels, P, CI_low, CI_high, P_KM, P_decay, n_touches, risk_score } = matrixData;

    // Filtra livelli con almeno un dato non-null
    const validIdx = levels
        .map((_, i) => i)
        .filter(i => P[i].some(v => v !== null));

    // Livello con risk score massimo
    const maxRiskIdx = risk_score.indexOf(Math.max(...risk_score.filter(Boolean)));

    return (
        <div className="border border-[#222222] bg-[#0F0F0F] p-4 sm:p-6 mt-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // Support · Resistance — Probability Matrix
                    </div>
                    <div className="text-sm font-mono mt-1 text-neutral-300">
                        P(rimbalzo | tocco, T) · Bootstrap BCa · Kaplan-Meier
                    </div>
                </div>
                <button
                    onClick={load}
                    className="text-neutral-500 hover:text-[#00E5C0] transition-colors"
                    title="Ricalcola"
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Heatmap della matrice P */}
            <div className="overflow-x-auto mb-8">
                <table className="w-full font-mono text-xs border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left text-neutral-500 uppercase tracking-[0.2em] text-[10px] pb-2 pr-4 font-normal">
                                Level
                            </th>
                            {T_LABELS.map(t => (
                                <th key={t} className="text-center text-neutral-500 uppercase tracking-[0.15em] text-[10px] pb-2 px-1 font-normal">
                                    {t}
                                </th>
                            ))}
                            <th className="text-center text-neutral-500 uppercase tracking-[0.15em] text-[10px] pb-2 px-2 font-normal">
                                Touches
                            </th>
                            <th className="text-center text-neutral-500 uppercase tracking-[0.15em] text-[10px] pb-2 px-2 font-normal">
                                Risk
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {validIdx.map(i => {
                            const isActive  = activeLevel === i;
                            const isMaxRisk = i === maxRiskIdx;
                            return (
                                <tr
                                    key={i}
                                    onClick={() => setActiveLevel(isActive ? null : i)}
                                    className={[
                                        "cursor-pointer transition-colors duration-100",
                                        isActive
                                            ? "bg-white/5"
                                            : "hover:bg-white/[0.02]",
                                        isMaxRisk ? "ring-1 ring-inset ring-[#FF3B30]/30" : "",
                                    ].join(" ")}
                                >
                                    {/* Prezzo livello */}
                                    <td className="py-1.5 pr-4 text-right">
                                        <span
                                            className="font-mono"
                                            style={{ color: riskColor(risk_score[i]) }}
                                        >
                                            {Number(levels[i]).toLocaleString("en-US", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        {isMaxRisk && (
                                            <span className="ml-2 text-[9px] text-[#FF3B30] uppercase tracking-widest">
                                                ⚠ max risk
                                            </span>
                                        )}
                                    </td>

                                    {/* Celle probabilità per orizzonte T */}
                                    {P[i].map((p, j) => (
                                        <td
                                            key={j}
                                            className="text-center py-1.5 px-1"
                                            style={{ background: heatColor(p) }}
                                            title={
                                                p !== null
                                                    ? `P=${(p * 100).toFixed(1)}%  CI=[${
                                                          CI_low[i][j] !== null
                                                              ? (CI_low[i][j] * 100).toFixed(1)
                                                              : "?"
                                                      }%, ${
                                                          CI_high[i][j] !== null
                                                              ? (CI_high[i][j] * 100).toFixed(1)
                                                              : "?"
                                                      }%]  KM=${
                                                          P_KM[i][j] !== null
                                                              ? (P_KM[i][j] * 100).toFixed(1)
                                                              : "?"
                                                      }%`
                                                    : "n.d."
                                            }
                                        >
                                            {p !== null ? (
                                                <span className="text-white/80">
                                                    {(p * 100).toFixed(0)}%
                                                </span>
                                            ) : (
                                                <span className="text-neutral-700">—</span>
                                            )}
                                        </td>
                                    ))}

                                    {/* Numero tocchi */}
                                    <td className="text-center py-1.5 px-2 text-neutral-400">
                                        {n_touches[i]}
                                    </td>

                                    {/* Risk score bar */}
                                    <td className="text-center py-1.5 px-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-12 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${(risk_score[i] || 0) * 100}%`,
                                                        background: riskColor(risk_score[i]),
                                                    }}
                                                />
                                            </div>
                                            <span
                                                className="text-[10px]"
                                                style={{ color: riskColor(risk_score[i]) }}
                                            >
                                                {((risk_score[i] || 0) * 100).toFixed(0)}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Legenda */}
            <div className="flex items-center gap-6 mb-6 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(0,229,192,0.7)" }} />
                    <span>Alto rimbalzo</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(255,59,48,0.5)" }} />
                    <span>Alta rottura</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-white/5" />
                    <span>N.d. (tocchi insuff.)</span>
                </div>
                <span className="ml-auto text-neutral-600">
                    Hover cella → CI BCa + KM
                </span>
            </div>

            {/* Dettaglio livello selezionato */}
            {activeLevel !== null && (
                <div className="border border-[#222222] p-4 mt-2">
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-3">
                        // Livello selezionato:{" "}
                        <span className="text-[#00E5C0]">
                            {Number(levels[activeLevel]).toFixed(2)}
                        </span>
                        {currency && ` ${currency}`}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                        {T_LABELS.map((t, j) => {
                            const p  = P[activeLevel][j];
                            const km = P_KM[activeLevel][j];
                            const pd = P_decay[activeLevel][j];
                            const lo = CI_low[activeLevel][j];
                            const hi = CI_high[activeLevel][j];
                            return (
                                <div
                                    key={t}
                                    className="border border-[#222222] p-3 text-center"
                                >
                                    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">
                                        {t}
                                    </div>
                                    {p !== null ? (
                                        <>
                                            <div
                                                className="text-lg font-mono"
                                                style={{ color: heatColor(p) === "rgba(255,255,255,0.04)" ? "#666" : ACCENT }}
                                            >
                                                {(p * 100).toFixed(1)}%
                                            </div>
                                            <div className="text-[9px] text-neutral-600 mt-1">
                                                Bootstrap
                                            </div>
                                            {lo !== null && hi !== null && (
                                                <div className="text-[9px] text-neutral-500 mt-0.5">
                                                    [{(lo * 100).toFixed(0)}%,{(hi * 100).toFixed(0)}%]
                                                </div>
                                            )}
                                            {km !== null && (
                                                <div className="text-[9px] text-neutral-400 mt-1">
                                                    KM: {(km * 100).toFixed(1)}%
                                                </div>
                                            )}
                                            {pd !== null && (
                                                <div className="text-[9px] text-neutral-600 mt-0.5">
                                                    Decay: {(pd * 100).toFixed(2)}%
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-neutral-700 text-sm">—</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupportMatrixPanel;