import React, { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X, Check, BellRing, Power } from "lucide-react";

import {
    PageHeader,
    Panel,
    StatTile,
    StatusBadge,
    PALETTE,
} from "../../components/quant/shared/primitives";
import DataSourceBadge from "../../components/quant/shared/DataSourceBadge";
import { useHorizon } from "../../context/HorizonContext";
import { useDemoMode } from "../../context/DemoModeContext";
import AnalystGuidePanel from "../../components/quant/shared/AnalystGuidePanel";

const DEFAULT_METRICS = [
    { id: "var_95", label: "VaR 95%" },
    { id: "cvar_95", label: "CVaR 95%" },
    { id: "volatility", label: "Realized Vol" },
];
const DEFAULT_OPERATORS = [">", ">=", "<", "<=", "=="];

const severityColor = (s) =>
    s === "critical" ? PALETTE.danger : s === "warning" ? PALETTE.warn : PALETTE.blue;

const metricLabel = (id, metrics) => metrics.find((m) => m.id === id)?.label || id;

const emptyDraft = (metrics) => ({
    id: null,
    name: "",
    enabled: true,
    logic: "AND",
    severity: "warning",
    conditions: [{ metric: metrics[0]?.id ?? "var_95", operator: ">", value: 0.8 }],
    action: "notify_push",
});

/**
 * Risk Alert Engine (CRUD).
 * Interfaccia per il backend rule-based: definizione di soglie condizionali
 * matematiche combinate con logica AND/OR. Lo stato è locale e pronto per il
 * cablaggio a POST/PUT/DELETE /api/alerts.
 */
const AlertEnginePage = () => {
    const { horizon, profile, rangeToken } = useHorizon();
    const { demoMode } = useDemoMode();
    const [rules, setRules] = useState([]);
    const [draft, setDraft] = useState(null);
    const [alertMetrics, setAlertMetrics] = useState(DEFAULT_METRICS);
    const [alertOperators] = useState(DEFAULT_OPERATORS);

    useEffect(() => {
        if (!demoMode) {
            setRules([]);
            setDraft(null);
            setAlertMetrics(DEFAULT_METRICS);
            return;
        }
        import("../../dev/mock/quantMock").then((mod) => {
            setAlertMetrics(mod.ALERT_METRICS ?? DEFAULT_METRICS);
            setRules(mod.buildSeedAlertRules(horizon, profile));
            setDraft(null);
        });
    }, [demoMode, horizon, profile, rangeToken]);

    const openCreate = () => setDraft(emptyDraft(alertMetrics));
    const openEdit = (rule) => setDraft({ ...rule, conditions: rule.conditions.map((c) => ({ ...c })) });
    const closeEditor = () => setDraft(null);

    const toggleRule = (id) =>
        setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

    const deleteRule = (id) => setRules((rs) => rs.filter((r) => r.id !== id));

    const saveDraft = () => {
        if (!draft.name.trim()) return;
        if (draft.id) {
            setRules((rs) => rs.map((r) => (r.id === draft.id ? draft : r)));
        } else {
            setRules((rs) => [...rs, { ...draft, id: `rule-${Date.now()}` }]);
        }
        setDraft(null);
    };

    // ── draft mutators ──
    const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
    const setCond = (i, k, v) =>
        setDraft((d) => ({
            ...d,
            conditions: d.conditions.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)),
        }));
    const addCond = () =>
        setDraft((d) => ({
            ...d,
            conditions: [...d.conditions, { metric: alertMetrics[0]?.id ?? "var_95", operator: ">", value: 0 }],
        }));
    const removeCond = (i) =>
        setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, idx) => idx !== i) }));

    const active = rules.filter((r) => r.enabled).length;
    const critical = rules.filter((r) => r.severity === "critical").length;

    return (
        <div data-testid="alert-engine-page">
            <PageHeader
                kicker="Operational · Rule Engine"
                title="Risk Alert"
                accent="Engine"
                description="Definisci soglie condizionali matematiche combinate (AND / OR) sulle metriche dei modelli — es. «Se P(rottura supporto) > 0.8 AND persistenza topologica < 0.15 → trigger»."
                actions={
                    <div className="flex items-center gap-2">
                        <DataSourceBadge source={demoMode ? "mock" : "error"} />
                        <AnalystGuidePanel model="alerts" />
                        <button
                            onClick={openCreate}
                            data-testid="new-rule-btn"
                            className="flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.2em] border border-[#00E5C0]/50 text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors"
                        >
                            <Plus size={14} /> New Rule
                        </button>
                    </div>
                }
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile label="Total Rules" value={rules.length} sub="defined" />
                <StatTile label="Active" value={active} sub="armed" tone="positive" />
                <StatTile label="Critical" value={critical} sub="severity = critical" tone="negative" />
                <StatTile label="Metrics Available" value={alertMetrics.length} sub="model signals" tone="info" />
            </div>

            {/* Editor */}
            {draft && (
                <Panel
                    title={draft.id ? "Edit Rule" : "New Rule"}
                    subtitle="conditional threshold builder"
                    className="mb-6 border-[#00E5C0]/30"
                    badge={<StatusBadge status="beta" />}
                    testId="rule-editor"
                >
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Field label="Rule name" className="md:col-span-2">
                                <input
                                    value={draft.name}
                                    onChange={(e) => setField("name", e.target.value)}
                                    placeholder="e.g. Support breakdown + low persistence"
                                    className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[12px] font-mono text-slate-200 focus:border-[#00E5C0] outline-none"
                                />
                            </Field>
                            <Field label="Severity">
                                <select
                                    value={draft.severity}
                                    onChange={(e) => setField("severity", e.target.value)}
                                    className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[12px] font-mono text-slate-200 focus:border-[#00E5C0] outline-none"
                                >
                                    <option value="info">info</option>
                                    <option value="warning">warning</option>
                                    <option value="critical">critical</option>
                                </select>
                            </Field>
                        </div>

                        {/* Conditions */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">
                                    Conditions
                                </span>
                                <div className="flex border border-[#1B2335]">
                                    {["AND", "OR"].map((lg) => (
                                        <button
                                            key={lg}
                                            onClick={() => setField("logic", lg)}
                                            className={`px-3 py-1 text-[10px] font-mono tracking-[0.2em] ${
                                                draft.logic === lg ? "bg-[#00E5C0] text-black" : "text-slate-500 hover:text-white"
                                            }`}
                                        >
                                            {lg}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {draft.conditions.map((c, i) => (
                                    <div key={i} className="flex flex-wrap items-center gap-2">
                                        {i > 0 && (
                                            <span className="text-[10px] font-mono text-[#4F8BFF] w-9">
                                                {draft.logic}
                                            </span>
                                        )}
                                        <select
                                            value={c.metric}
                                            onChange={(e) => setCond(i, "metric", e.target.value)}
                                            className="flex-1 min-w-[180px] bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:border-[#00E5C0] outline-none"
                                        >
                                            {alertMetrics.map((m) => (
                                                <option key={m.id} value={m.id}>{m.label}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={c.operator}
                                            onChange={(e) => setCond(i, "operator", e.target.value)}
                                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-[#00E5C0] focus:border-[#00E5C0] outline-none"
                                        >
                                            {alertOperators.map((op) => (
                                                <option key={op} value={op}>{op}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={c.value}
                                            onChange={(e) => setCond(i, "value", parseFloat(e.target.value))}
                                            className="w-24 bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:border-[#00E5C0] outline-none"
                                        />
                                        {draft.conditions.length > 1 && (
                                            <button onClick={() => removeCond(i)} className="text-slate-600 hover:text-[#FF4D5E] p-1">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={addCond}
                                className="mt-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 hover:text-[#00E5C0]"
                            >
                                <Plus size={12} /> Add condition
                            </button>
                        </div>

                        <Field label="Action / trigger">
                            <input
                                value={draft.action}
                                onChange={(e) => setField("action", e.target.value)}
                                placeholder="notify_email + flatten_exposure"
                                className="w-full bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-[12px] font-mono text-slate-200 focus:border-[#00E5C0] outline-none"
                            />
                        </Field>

                        {/* Compiled preview */}
                        <div className="border border-[#1B2335] bg-[#0A0F1C] px-3 py-2">
                            <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 mb-1">
                                Compiled predicate
                            </div>
                            <code className="text-[11px] text-[#00E5C0]">
                                IF {draft.conditions.map((c) => `${c.metric} ${c.operator} ${c.value}`).join(` ${draft.logic} `)} → {draft.action}
                            </code>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={saveDraft}
                                data-testid="save-rule-btn"
                                className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] bg-[#00E5C0] text-black hover:bg-[#00E5C0]/85 transition-colors"
                            >
                                <Check size={14} /> Save rule
                            </button>
                            <button
                                onClick={closeEditor}
                                className="px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] border border-[#1B2335] text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </Panel>
            )}

            {/* Rules list */}
            <Panel title="Defined Rules" subtitle="rule-based risk monitor" testId="rules-list">
                {rules.length === 0 ? (
                    <div className="text-[12px] font-mono text-slate-500 py-8 text-center">
                        No rules defined. Create one to arm the monitor.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rules.map((r) => (
                            <div
                                key={r.id}
                                className="border border-[#1B2335] bg-[#0A0F1C] p-4"
                                data-testid={`rule-${r.id}`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <span
                                            className="mt-1 w-2 h-2 rounded-full shrink-0"
                                            style={{ background: r.enabled ? severityColor(r.severity) : "#2A3550" }}
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <BellRing size={13} style={{ color: severityColor(r.severity) }} />
                                                <span className="text-[13px] font-medium text-slate-200 truncate">{r.name}</span>
                                                <span
                                                    className="text-[9px] font-mono uppercase tracking-[0.2em] px-1.5 py-0.5 border"
                                                    style={{ color: severityColor(r.severity), borderColor: `${severityColor(r.severity)}55` }}
                                                >
                                                    {r.severity}
                                                </span>
                                            </div>
                                            <code className="block mt-2 text-[11px] text-slate-400 leading-relaxed">
                                                IF{" "}
                                                {r.conditions.map((c, idx) => (
                                                    <span key={idx}>
                                                        {idx > 0 && <span className="text-[#4F8BFF]"> {r.logic} </span>}
                                                        <span className="text-slate-300">{metricLabel(c.metric, alertMetrics)}</span>{" "}
                                                        <span className="text-[#00E5C0]">{c.operator}</span> {c.value}
                                                    </span>
                                                ))}
                                                <span className="text-slate-600"> → </span>
                                                <span className="text-[#FFB020]">{r.action}</span>
                                            </code>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <IconBtn title={r.enabled ? "Disarm" : "Arm"} onClick={() => toggleRule(r.id)} active={r.enabled}>
                                            <Power size={14} />
                                        </IconBtn>
                                        <IconBtn title="Edit" onClick={() => openEdit(r)}>
                                            <Pencil size={14} />
                                        </IconBtn>
                                        <IconBtn title="Delete" onClick={() => deleteRule(r.id)} danger>
                                            <Trash2 size={14} />
                                        </IconBtn>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    );
};

const Field = ({ label, children, className = "" }) => (
    <label className={`block ${className}`}>
        <span className="block text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 mb-1.5">
            {label}
        </span>
        {children}
    </label>
);

const IconBtn = ({ children, onClick, title, danger, active }) => (
    <button
        type="button"
        title={title}
        onClick={onClick}
        className={`p-2 border border-[#1B2335] transition-colors ${
            danger
                ? "text-slate-500 hover:text-[#FF4D5E] hover:border-[#FF4D5E]/40"
                : active
                  ? "text-[#00E5C0] border-[#00E5C0]/40"
                  : "text-slate-500 hover:text-white hover:border-[#2A3550]"
        }`}
    >
        {children}
    </button>
);

export default AlertEnginePage;
