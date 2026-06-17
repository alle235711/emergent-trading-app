import React, { useCallback, useEffect, useState } from "react";

import {
    PageHeader,
    Panel,
    StatTile,
    Legend,
} from "../../components/quant/shared/primitives";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { fetchSupportMatrix } from "../../lib/api";
import { useHorizon } from "../../context/HorizonContext";
import { useTicker } from "../../context/TickerContext";
import { horizonToPeriod } from "../../lib/tickerSymbol";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";

const HORIZON_LABELS = ["1d", "3d", "5d", "10d", "20d"];

/** Heat colour: high bounce probability → teal, low → red. */
function heatColor(p) {
    if (p == null) return "rgba(255,255,255,0.03)";
    const t = Math.max(0, Math.min(1, p));
    if (t >= 0.5) return `rgba(0,229,192,${0.12 + (t - 0.5) * 1.5})`;
    return `rgba(255,77,94,${0.12 + (0.5 - t) * 1.2})`;
}

/**
 * Support Probability Matrix — Peak Detection & Survival Analysis.
 * Live data from /api/market/support-matrix (Yahoo OHLCV).
 */
const SupportMatrixPage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { symbol } = useTicker();
    const period = horizonToPeriod(horizon);

    const [m, setM] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sel, setSel] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchSupportMatrix(symbol, period);
            setM(payload.result);
        } catch (err) {
            setError(err?.response?.data?.detail ?? err?.message ?? "Backend unreachable");
            setM(null);
        } finally {
            setLoading(false);
        }
    }, [symbol, period, profile, rangeToken]);

    useEffect(() => { load(); }, [load]);

    const dataSource = error ? "error" : "live";
    const { levels = [], P = [], CI_low = [], CI_high = [], P_KM = [], n_touches = [], risk_score = [] } = m ?? {};

    const maxRiskIdx = risk_score.length ? risk_score.indexOf(Math.max(...risk_score)) : -1;
    const flatP = P.flat().filter((v) => v != null);
    const avgBounce = flatP.length ? flatP.reduce((s, v) => s + v, 0) / flatP.length : 0;

    const cell = sel ? { i: sel[0], j: sel[1] } : null;

    return (
        <div data-testid="support-matrix-page">
            <PageHeader
                kicker="Operational · Survival Analysis"
                title="Support Probability"
                accent="Matrix"
                description="Estrazione S/R via clustering su OHLCV Yahoo e probabilità condizionata P(S | t, T) con decadimento temporale e intervalli di confidenza bootstrap."
                actions={
                    <div className="flex items-center gap-2">
                        <DataSourceBadge source={dataSource} />
                        <AnalystGuidePanel model="matrix" />
                    </div>
                }
            />

            {error && (
                <div className="mb-6 px-4 py-3 border border-[#FF4D5E]/40 bg-[#FF4D5E]/[0.06] text-[11px] font-mono text-[#FF9AA5]">
                    {error}
                </div>
            )}

            {loading && !m ? (
                <div className="h-64 bg-[#0E1422] animate-pulse mb-6" />
            ) : null}

            {m && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <StatTile label="Price Levels (S_i)" value={levels.length} sub="clustered · Yahoo" tone="accent" />
                        <StatTile label="Horizons (T_j)" value={HORIZON_LABELS.length} sub={HORIZON_LABELS.join(" · ")} />
                        <StatTile label="Avg Bounce P" value={`${(avgBounce * 100).toFixed(0)}%`} sub="across matrix" tone="positive" />
                        <StatTile
                            label="Max-Risk Level"
                            value={maxRiskIdx >= 0 ? levels[maxRiskIdx].toFixed(1) : "—"}
                            sub={maxRiskIdx >= 0 ? `P(break 20d) ${(risk_score[maxRiskIdx] * 100).toFixed(0)}%` : ""}
                            tone="negative"
                        />
                    </div>

                    <Panel
                        title="P(rimbalzo | tocco, T) — Heatmap"
                        subtitle={`rows = price levels S_i · cols = horizons T_j · ${symbol} · ${period}`}
                        testId="prob-heatmap"
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full font-mono text-[11px] border-collapse">
                                <thead>
                                    <tr className="text-slate-500 uppercase tracking-[0.2em] text-[10px]">
                                        <th className="text-right pb-3 pr-4 font-normal">S_i \ T_j</th>
                                        {HORIZON_LABELS.map((t) => (
                                            <th key={t} className="text-center pb-3 px-2 font-normal">{t}</th>
                                        ))}
                                        <th className="text-center pb-3 px-3 font-normal">Touches</th>
                                        <th className="text-center pb-3 px-3 font-normal">Risk</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {levels.map((lvl, i) => (
                                        <tr key={i} className="border-t border-[#1B2335]">
                                            <td className="py-2 pr-4 text-right text-[#00E5C0]">{Number(lvl).toFixed(1)}</td>
                                            {(P[i] ?? []).map((p, j) => (
                                                <td
                                                    key={j}
                                                    className="text-center py-2 px-2 cursor-pointer hover:ring-1 hover:ring-[#00E5C0]/40"
                                                    style={{ background: heatColor(p) }}
                                                    onClick={() => setSel([i, j])}
                                                >
                                                    {p != null ? `${(p * 100).toFixed(0)}%` : "—"}
                                                </td>
                                            ))}
                                            <td className="text-center py-2 px-3 text-slate-400">{n_touches[i] ?? "—"}</td>
                                            <td className="text-center py-2 px-3 text-[#FFB020]">
                                                {risk_score[i] != null ? `${(risk_score[i] * 100).toFixed(0)}%` : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {cell && (
                            <div className="mt-4 p-4 border border-[#1B2335] bg-[#0A0F1C] text-[11px] font-mono text-slate-400">
                                S_{cell.i} = {levels[cell.i]?.toFixed(2)} · T = {HORIZON_LABELS[cell.j]} ·
                                P = {P[cell.i]?.[cell.j] != null ? `${(P[cell.i][cell.j] * 100).toFixed(1)}%` : "—"} ·
                                CI [{CI_low[cell.i]?.[cell.j] != null ? (CI_low[cell.i][cell.j] * 100).toFixed(0) : "—"}%,
                                {CI_high[cell.i]?.[cell.j] != null ? (CI_high[cell.i][cell.j] * 100).toFixed(0) : "—"}%] ·
                                KM = {P_KM[cell.i]?.[cell.j] != null ? `${(P_KM[cell.i][cell.j] * 100).toFixed(0)}%` : "—"}
                            </div>
                        )}
                        <div className="mt-4">
                            <Legend
                                items={[
                                    { label: "high bounce P", color: "rgba(0,229,192,0.45)" },
                                    { label: "low bounce P", color: "rgba(255,77,94,0.35)" },
                                ]}
                            />
                        </div>
                    </Panel>
                </>
            )}
        </div>
    );
};

export default SupportMatrixPage;
