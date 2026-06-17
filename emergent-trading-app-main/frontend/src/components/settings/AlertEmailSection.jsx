/**
 * AlertEmailSection — Email alert configuration in Settings.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Bell, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
    getAlertConfig,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule,
    testAlertEmail,
    updateAlertEmailTo,
    runAlertChecks,
} from "../../lib/api";

const MODELS = ["sheaf", "clique", "affine", "hodge", "quantum"];
const METRICS = {
    sheaf: ["obstruction_index"],
    clique: ["max_beta1_norm"],
    affine: ["smoothness_score"],
    hodge: ["solenoidal_pct"],
    quantum: ["n_signal_ratio"],
};

const AlertEmailSection = () => {
    const [config, setConfig] = useState(null);
    const [emailTo, setEmailTo] = useState("");
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [newRule, setNewRule] = useState({
        ticker: "SPY",
        model: "sheaf",
        metric: "obstruction_index",
        threshold: 0.5,
        direction: "above",
        cooldown_hours: 24,
    });

    const load = useCallback(async () => {
        try {
            const res = await getAlertConfig();
            setConfig(res);
            setEmailTo(res.email_to || "");
        } catch {
            toast.error("Errore caricamento alert config");
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleSaveEmail = async () => {
        try {
            await updateAlertEmailTo(emailTo);
            toast.success("Email destinazione aggiornata");
            load();
        } catch {
            toast.error("Errore aggiornamento email");
        }
    };

    const handleTestEmail = async () => {
        setLoading(true);
        try {
            const res = await testAlertEmail();
            if (res.sent) {
                toast.success("Email di test inviata");
            } else {
                toast.warning(res.message || "SMTP non configurato");
            }
        } catch {
            toast.error("Errore invio test");
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (rule) => {
        await updateAlertRule(rule.id, { enabled: !rule.enabled });
        load();
    };

    const handleDelete = async (id) => {
        await deleteAlertRule(id);
        toast.success("Regola eliminata");
        load();
    };

    const handleAddRule = async () => {
        try {
            await createAlertRule(newRule);
            toast.success("Regola aggiunta");
            setShowForm(false);
            load();
        } catch {
            toast.error("Errore creazione regola");
        }
    };

    const handleRunChecks = async () => {
        setLoading(true);
        try {
            const res = await runAlertChecks();
            toast.success(`Controlli completati — ${res.fired} alert attivati`);
            load();
        } catch {
            toast.error("Errore esecuzione controlli");
        } finally {
            setLoading(false);
        }
    };

    return (
        <section
            className="border border-[#1B2335] bg-[#0E1422] p-6"
            data-testid="alert-email-section"
        >
            <div className="flex items-center gap-2 mb-4">
                <Bell size={16} className="text-[#FFB020]" />
                <h2 className="text-[11px] font-mono uppercase tracking-[0.25em] text-slate-400">
                    Alert Email
                </h2>
            </div>

            <div className="space-y-4 mb-6">
                <div>
                    <label className="text-[10px] font-mono uppercase text-slate-500">
                        Email destinazione
                    </label>
                    <div className="flex gap-2 mt-1">
                        <input
                            type="email"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                            className="flex-1 bg-[#0A0F1C] border border-[#1B2335] px-3 py-2 text-sm text-slate-300 font-mono"
                        />
                        <button
                            type="button"
                            onClick={handleSaveEmail}
                            className="px-3 py-2 border border-[#1B2335] text-[10px] font-mono uppercase text-slate-400 hover:text-white"
                        >
                            Salva
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleTestEmail}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 border border-[#FFB020]/50 text-[10px] font-mono uppercase text-[#FFB020] hover:bg-[#FFB020]/10"
                    >
                        <Mail size={12} />
                        Testa invio email
                    </button>
                    <button
                        type="button"
                        onClick={handleRunChecks}
                        disabled={loading}
                        className="px-4 py-2 border border-[#1B2335] text-[10px] font-mono uppercase text-slate-400 hover:text-white"
                    >
                        Esegui controlli ora
                    </button>
                </div>

                {config && !config.email_configured && (
                    <p className="text-[11px] text-[#FFB020]">
                        SMTP non configurato — compila ALERT_EMAIL_* in backend/.env
                    </p>
                )}
            </div>

            {/* Rules table */}
            <div className="overflow-x-auto mb-4">
                <table className="w-full text-[11px] font-mono">
                    <thead>
                        <tr className="text-slate-600 uppercase tracking-wider border-b border-[#1B2335]">
                            <th className="text-left py-2 pr-3">Ticker</th>
                            <th className="text-left py-2 pr-3">Modello</th>
                            <th className="text-left py-2 pr-3">Metrica</th>
                            <th className="text-left py-2 pr-3">Soglia</th>
                            <th className="text-left py-2 pr-3">Ultimo</th>
                            <th className="text-left py-2 pr-3">On</th>
                            <th className="text-left py-2">Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(config?.rules || []).map((r) => (
                            <tr key={r.id} className="border-b border-[#1B2335]/50 text-slate-400">
                                <td className="py-2 pr-3 text-slate-200">{r.ticker}</td>
                                <td className="py-2 pr-3">{r.model}</td>
                                <td className="py-2 pr-3">{r.metric}</td>
                                <td className="py-2 pr-3">
                                    {r.direction} {r.threshold}
                                </td>
                                <td className="py-2 pr-3">{r.last_fired || "—"}</td>
                                <td className="py-2 pr-3">
                                    <button
                                        type="button"
                                        onClick={() => handleToggle(r)}
                                        className={`px-2 py-0.5 border text-[9px] uppercase ${
                                            r.enabled
                                                ? "border-[#00E5C0]/50 text-[#00E5C0]"
                                                : "border-slate-700 text-slate-600"
                                        }`}
                                    >
                                        {r.enabled ? "ON" : "OFF"}
                                    </button>
                                </td>
                                <td className="py-2">
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(r.id)}
                                        className="text-[#FF4D5E] hover:text-[#FF4D5E]/80"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm ? (
                <div className="border border-[#1B2335] p-4 space-y-3 mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <input
                            placeholder="Ticker"
                            value={newRule.ticker}
                            onChange={(e) =>
                                setNewRule({ ...newRule, ticker: e.target.value.toUpperCase() })
                            }
                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-300"
                        />
                        <select
                            value={newRule.model}
                            onChange={(e) =>
                                setNewRule({
                                    ...newRule,
                                    model: e.target.value,
                                    metric: METRICS[e.target.value]?.[0] || "obstruction_index",
                                })
                            }
                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-300"
                        >
                            {MODELS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <select
                            value={newRule.metric}
                            onChange={(e) => setNewRule({ ...newRule, metric: e.target.value })}
                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-300"
                        >
                            {(METRICS[newRule.model] || []).map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            step="0.01"
                            placeholder="Soglia"
                            value={newRule.threshold}
                            onChange={(e) =>
                                setNewRule({ ...newRule, threshold: parseFloat(e.target.value) })
                            }
                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-300"
                        />
                        <select
                            value={newRule.direction}
                            onChange={(e) => setNewRule({ ...newRule, direction: e.target.value })}
                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-300"
                        >
                            <option value="above">above</option>
                            <option value="below">below</option>
                        </select>
                        <input
                            type="number"
                            placeholder="Cooldown (h)"
                            value={newRule.cooldown_hours}
                            onChange={(e) =>
                                setNewRule({ ...newRule, cooldown_hours: parseInt(e.target.value, 10) })
                            }
                            className="bg-[#0A0F1C] border border-[#1B2335] px-2 py-1.5 text-[11px] font-mono text-slate-300"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleAddRule}
                            className="px-3 py-1.5 border border-[#00E5C0]/50 text-[10px] font-mono uppercase text-[#00E5C0]"
                        >
                            Conferma
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-3 py-1.5 border border-[#1B2335] text-[10px] font-mono uppercase text-slate-500"
                        >
                            Annulla
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-[#1B2335] text-[10px] font-mono uppercase text-slate-400 hover:text-white"
                >
                    <Plus size={12} /> Aggiungi regola
                </button>
            )}
        </section>
    );
};

export default AlertEmailSection;
