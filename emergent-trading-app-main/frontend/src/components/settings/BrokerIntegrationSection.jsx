import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Lock, ShieldAlert, Trash2 } from "lucide-react";

import {
    deleteBrokerKeys,
    getBrokerKeys,
    saveBrokerKeys,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const BROKERS = [
    { value: "alpaca", label: "Alpaca" },
    { value: "interactive_brokers", label: "Interactive Brokers" },
    { value: "binance", label: "Binance" },
    { value: "other", label: "Altro" },
];

/**
 * Broker integration UI.
 *
 * IMPORTANT (per product spec): this UI does **not** connect to any real
 * broker. It only persists credentials via `/api/user/broker-keys` so the
 * trading layer can plug in later. Secrets are masked on read.
 */
const BrokerIntegrationSection = () => {
    const { user } = useAuth();
    const [broker, setBroker] = useState("alpaca");
    const [apiKey, setApiKey] = useState("");
    const [apiSecret, setApiSecret] = useState("");
    const [revealSecret, setRevealSecret] = useState(false);

    const [stored, setStored] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const data = await getBrokerKeys(user.id);
            setStored(data);
            if (data?.broker) setBroker(data.broker);
        } catch (err) {
            const detail =
                err?.response?.data?.detail || err?.message || "Errore caricamento API key";
            toast.error(`ERR :: ${String(detail).toUpperCase()}`);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSave = async (e) => {
        e?.preventDefault();
        if (apiKey.trim().length < 4 || apiSecret.trim().length < 4) {
            toast.error("ERR :: API KEY/SECRET TOO SHORT (MIN 4)");
            return;
        }
        setBusy(true);
        try {
            const data = await saveBrokerKeys(user.id, {
                broker,
                api_key: apiKey.trim(),
                api_secret: apiSecret.trim(),
            });
            setStored(data);
            setApiKey("");
            setApiSecret("");
            setRevealSecret(false);
            toast.success("API_KEYS :: SAVED (UI-ONLY MOCK)");
        } catch (err) {
            const detail =
                err?.response?.data?.detail || err?.message || "Errore salvataggio";
            toast.error(`ERR :: ${String(detail).toUpperCase()}`);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        setBusy(true);
        try {
            const data = await deleteBrokerKeys(user.id);
            setStored(data);
            toast.success("API_KEYS :: REMOVED");
        } catch (err) {
            const detail =
                err?.response?.data?.detail || err?.message || "Errore eliminazione";
            toast.error(`ERR :: ${String(detail).toUpperCase()}`);
        } finally {
            setBusy(false);
        }
    };

    const configured = stored?.configured;

    return (
        <section
            className="border border-[#222222] bg-[#0F0F0F]"
            data-testid="settings-broker-section"
        >
            <header className="border-b border-[#222222] px-5 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // Broker integration · UI only
                    </div>
                    <h2 className="text-lg sm:text-xl font-mono mt-1 flex items-center gap-2">
                        <KeyRound size={16} className="text-[#00E5C0]" strokeWidth={1.5} />
                        API credentials
                    </h2>
                </div>
                <div
                    className={[
                        "text-[10px] font-mono uppercase tracking-[0.25em] px-2.5 py-1 border",
                        configured
                            ? "border-[#00E5C0] text-[#00E5C0]"
                            : "border-[#222222] text-neutral-500",
                    ].join(" ")}
                    data-testid="broker-status-pill"
                >
                    {loading ? "Loading…" : configured ? "Configured" : "Not configured"}
                </div>
            </header>

            <div className="p-5 sm:p-6 space-y-6">
                {/* Notice */}
                <div className="border border-[#FFB020]/40 bg-[#FFB020]/5 p-4 flex items-start gap-3">
                    <ShieldAlert
                        size={16}
                        className="text-[#FFB020] mt-0.5 shrink-0"
                        strokeWidth={1.5}
                    />
                    <div className="font-mono text-[11px] sm:text-xs text-[#FFB020] leading-relaxed">
                        <span className="uppercase tracking-[0.2em]">notice ::</span>{" "}
                        Le credenziali sono salvate solo per predisporre la futura
                        integrazione operativa. In questa fase{" "}
                        <span className="text-white">nessun ordine</span> viene inviato a
                        un broker reale.
                    </div>
                </div>

                {/* Currently stored */}
                {configured && !loading ? (
                    <div
                        className="border border-[#222222] p-4 grid sm:grid-cols-3 gap-3 sm:gap-6"
                        data-testid="broker-current"
                    >
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                                Broker
                            </div>
                            <div
                                className="text-sm font-mono mt-1 text-white"
                                data-testid="broker-current-name"
                            >
                                {BROKERS.find((b) => b.value === stored.broker)?.label ||
                                    stored.broker}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                                API key
                            </div>
                            <div
                                className="text-sm font-mono mt-1 text-neutral-300"
                                data-testid="broker-current-key-masked"
                            >
                                {stored.api_key_masked || "—"}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                                API secret
                            </div>
                            <div className="text-sm font-mono mt-1 text-neutral-300">
                                {stored.api_secret_masked || "—"}
                            </div>
                        </div>
                        <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#222222]">
                            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                                Updated ·{" "}
                                {stored.updated_at
                                    ? new Date(stored.updated_at).toLocaleString()
                                    : "—"}
                            </div>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={busy}
                                data-testid="broker-delete-btn"
                                className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] px-3 py-2 border border-[#FF3B30] text-[#FF3B30] hover:bg-[#FF3B30] hover:text-black transition-colors duration-150 disabled:opacity-40"
                            >
                                <Trash2 size={12} strokeWidth={1.6} />
                                <span>Revoke keys</span>
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Form */}
                <form
                    onSubmit={handleSave}
                    className="space-y-5"
                    data-testid="broker-form"
                >
                    <div>
                        <label
                            htmlFor="broker-select"
                            className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                        >
                            Broker
                        </label>
                        <select
                            id="broker-select"
                            value={broker}
                            onChange={(e) => setBroker(e.target.value)}
                            disabled={busy}
                            data-testid="broker-select"
                            className="w-full bg-[#0A0A0A] border border-[#222222] focus:border-[#00E5C0] outline-none px-3 py-3 text-sm font-mono text-white"
                        >
                            {BROKERS.map((b) => (
                                <option key={b.value} value={b.value}>
                                    {b.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="api-key"
                            className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                        >
                            API Key
                        </label>
                        <div className="flex items-center gap-3 border-b border-[#222222] focus-within:border-[#00E5C0] transition-colors duration-150">
                            <KeyRound
                                size={16}
                                className="text-neutral-500 shrink-0"
                                strokeWidth={1.5}
                            />
                            <input
                                id="api-key"
                                type="text"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={
                                    configured
                                        ? "INSERT NEW KEY TO OVERWRITE"
                                        : "PASTE YOUR API KEY"
                                }
                                disabled={busy}
                                spellCheck={false}
                                autoComplete="off"
                                data-testid="broker-key-input"
                                className="bg-transparent w-full py-3 outline-none border-0 text-sm font-mono placeholder:text-neutral-600 text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="api-secret"
                            className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                        >
                            API Secret
                        </label>
                        <div className="flex items-center gap-3 border-b border-[#222222] focus-within:border-[#00E5C0] transition-colors duration-150">
                            <Lock
                                size={16}
                                className="text-neutral-500 shrink-0"
                                strokeWidth={1.5}
                            />
                            <input
                                id="api-secret"
                                type={revealSecret ? "text" : "password"}
                                value={apiSecret}
                                onChange={(e) => setApiSecret(e.target.value)}
                                placeholder={
                                    configured
                                        ? "INSERT NEW SECRET TO OVERWRITE"
                                        : "PASTE YOUR API SECRET"
                                }
                                disabled={busy}
                                spellCheck={false}
                                autoComplete="off"
                                data-testid="broker-secret-input"
                                className="bg-transparent w-full py-3 outline-none border-0 text-sm font-mono placeholder:text-neutral-600 text-white"
                            />
                            <button
                                type="button"
                                onClick={() => setRevealSecret((v) => !v)}
                                data-testid="broker-secret-reveal"
                                className="text-neutral-500 hover:text-white transition-colors"
                                aria-label={revealSecret ? "Hide secret" : "Show secret"}
                            >
                                {revealSecret ? (
                                    <EyeOff size={16} strokeWidth={1.5} />
                                ) : (
                                    <Eye size={16} strokeWidth={1.5} />
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={busy || !apiKey.trim() || !apiSecret.trim()}
                        data-testid="broker-save-btn"
                        className="text-xs font-mono tracking-[0.25em] uppercase px-5 py-3 border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#00E5C0]"
                    >
                        {busy ? "Saving…" : configured ? "Update credentials" : "Save credentials"}
                    </button>
                </form>
            </div>
        </section>
    );
};

export default BrokerIntegrationSection;
