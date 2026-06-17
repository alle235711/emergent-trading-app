import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";

import AppHeader from "../components/layout/AppHeader";
import { useAuth } from "../context/AuthContext";

const MODES = {
    signin: {
        title: "Access terminal",
        subtitle:
            "Accedi per gestire la tua watchlist personale e collegare la tua API key del broker.",
        cta: "Sign in",
        switchPrompt: "Non hai un account?",
        switchLabel: "Crea account",
        toggleTo: "signup",
    },
    signup: {
        title: "Create account",
        subtitle:
            "Crea un account locale per salvare i tuoi ticker preferiti e predisporre l'integrazione broker.",
        cta: "Create account",
        switchPrompt: "Hai già un account?",
        switchLabel: "Accedi",
        toggleTo: "signin",
    },
};

const LoginPage = () => {
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const { signIn, signUp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = location.state?.from || "/";

    const meta = MODES[mode];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (mode === "signup") {
                signUp(email, password);
                toast.success("ACCOUNT_CREATED :: WELCOME ON BOARD");
            } else {
                signIn(email, password);
                toast.success("SIGNED_IN :: SESSION ACTIVE");
            }
            navigate(redirectTo, { replace: true });
        } catch (err) {
            const msg = err?.message || "Errore sconosciuto";
            toast.error(`ERR :: ${msg.toUpperCase()}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="min-h-screen bg-[#050505] text-white bg-grid"
            data-testid="login-page"
        >
            <AppHeader />

            <main className="max-w-[1100px] mx-auto px-6 sm:px-10 py-16 sm:py-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
                {/* Left rail — copy */}
                <section className="space-y-6">
                    <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500">
                        // {mode === "signin" ? "Sign in" : "Sign up"}
                    </div>
                    <h1 className="text-4xl sm:text-5xl tracking-tight font-medium leading-tight">
                        {meta.title.split(" ")[0]}{" "}
                        <span className="text-[#00E5C0]">
                            {meta.title.split(" ").slice(1).join(" ")}
                        </span>
                    </h1>
                    <p className="text-sm sm:text-base text-neutral-400 max-w-md leading-relaxed">
                        {meta.subtitle}
                    </p>

                    <div className="border-t border-[#222222] pt-6 space-y-3 max-w-md">
                        <div className="flex items-start gap-3">
                            <ShieldCheck
                                size={16}
                                className="text-[#00E5C0] mt-0.5 shrink-0"
                                strokeWidth={1.5}
                            />
                            <div className="text-xs font-mono text-neutral-400 leading-relaxed">
                                <span className="text-neutral-200">Mocked auth.</span>{" "}
                                Le credenziali sono salvate solo in locale (localStorage)
                                per questa fase. Nessuna informazione lascia il browser
                                tranne il tuo <span className="text-[#00E5C0]">user_id</span>{" "}
                                opaco, usato per memorizzare watchlist e API key broker.
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right rail — form */}
                <section
                    className="border border-[#222222] bg-[#0F0F0F] p-6 sm:p-8"
                    data-testid="login-form-panel"
                >
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label
                                htmlFor="email"
                                className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                            >
                                Email
                            </label>
                            <div className="flex items-center gap-3 border-b border-[#222222] focus-within:border-[#00E5C0] transition-colors duration-150">
                                <Mail
                                    size={16}
                                    className="text-neutral-500 shrink-0"
                                    strokeWidth={1.5}
                                />
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    spellCheck={false}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="trader@quantdesk.io"
                                    data-testid="login-email-input"
                                    className="bg-transparent w-full py-3 outline-none border-0 text-sm font-mono lowercase placeholder:text-neutral-600 text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500 block mb-2"
                            >
                                Password
                            </label>
                            <div className="flex items-center gap-3 border-b border-[#222222] focus-within:border-[#00E5C0] transition-colors duration-150">
                                <Lock
                                    size={16}
                                    className="text-neutral-500 shrink-0"
                                    strokeWidth={1.5}
                                />
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    minLength={6}
                                    autoComplete={
                                        mode === "signup"
                                            ? "new-password"
                                            : "current-password"
                                    }
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    data-testid="login-password-input"
                                    className="bg-transparent w-full py-3 outline-none border-0 text-sm font-mono placeholder:text-neutral-600 text-white"
                                />
                            </div>
                            {mode === "signup" ? (
                                <div className="text-[10px] font-mono text-neutral-600 mt-2 tracking-wide">
                                    Min 6 caratteri.
                                </div>
                            ) : null}
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            data-testid="login-submit-btn"
                            className="w-full flex items-center justify-center gap-3 text-xs font-mono tracking-[0.25em] uppercase px-4 py-3 border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#00E5C0]"
                        >
                            <span>{submitting ? "Working…" : meta.cta}</span>
                            <ArrowRight size={14} strokeWidth={1.6} />
                        </button>

                        <div className="text-center text-[11px] font-mono text-neutral-500">
                            <span className="mr-2">{meta.switchPrompt}</span>
                            <button
                                type="button"
                                onClick={() => setMode(meta.toggleTo)}
                                data-testid="login-toggle-mode"
                                className="text-[#00E5C0] hover:underline tracking-[0.2em] uppercase"
                            >
                                {meta.switchLabel}
                            </button>
                        </div>
                    </form>

                    <div className="mt-8 border-t border-[#222222] pt-4 text-center">
                        <Link
                            to="/"
                            data-testid="login-back-home"
                            className="text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-600 hover:text-neutral-300"
                        >
                            ← Torna alla dashboard pubblica
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default LoginPage;
