/**
 * horizon.js
 * ────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the GLOBAL investment-horizon regime.
 *
 * The platform reasons about three macro time-frames; switching the global
 * horizon re-parametrises every mock data generator (volatility, forecast
 * length, survival decay, drift, topological persistence …) so all 7 dashboards
 * change *visually* and *semantically*, and re-focuses the Analyst Insight panel
 * on the matching strategic section.
 *
 *   • short  → Breve Termine   · Speculazione / Cash Flow
 *   • medium → Medio Termine    · Liquidità / Swing
 *   • long   → Lungo Termine    · Wealth / Accumulo
 *
 * Numeric fields are consumed by dev/mock/quantMock.js (Demo Mode only); display fields by the UI.
 */

export const HORIZON_ORDER = ["short", "medium", "long"];

export const HORIZON_PROFILES = {
    short: {
        id: "short",
        label: "Breve Termine",
        tag: "Speculazione",
        caption: "Speculazione · Cash Flow",
        blurb: "oggi / questa settimana",
        accent: "#FFB020",
        // ── numeric parametrisation ──
        seedSalt: 17,
        volMult: 1.6, // realised-vol emphasis → wider VaR / diffusion
        steps: 10, // forecast steps (days) — overridden by customRanges
        bars: 120, // OHLC look-back window
        lambdaMult: 1.9, // faster survival decay of supports
        drift: 0.0, // negligible drift over the very short run
        persistenceMult: 0.62, // topological structure is more ephemeral
        gaugeBias: 0.18, // higher structural-break sensitivity
        riskBias: 0.1,
        // ── user-configurable day range ──
        rangeMin: 1,
        rangeMax: 21,
        rangeDefault: 10,
        rangeLabel: "1–21 giorni",
    },
    medium: {
        id: "medium",
        label: "Medio Termine",
        tag: "Liquidità",
        caption: "Liquidità · Swing 1–3 mesi",
        blurb: "prossimi 1–3 mesi",
        accent: "#4F8BFF",
        seedSalt: 53,
        volMult: 1.0,
        steps: 30,
        bars: 180,
        lambdaMult: 1.0,
        drift: 0.06 / 252,
        persistenceMult: 1.0,
        gaugeBias: 0.0,
        riskBias: 0.0,
        // ── user-configurable day range ──
        rangeMin: 14,
        rangeMax: 90,
        rangeDefault: 30,
        rangeLabel: "14–90 giorni",
    },
    long: {
        id: "long",
        label: "Lungo Termine",
        tag: "Accumulo",
        caption: "Wealth · Accumulo",
        blurb: "macro-regime pluriennale",
        accent: "#00E5C0",
        seedSalt: 91,
        volMult: 0.62,
        steps: 60,
        bars: 320,
        lambdaMult: 0.42,
        drift: 0.09 / 252,
        persistenceMult: 1.5,
        gaugeBias: -0.14,
        riskBias: -0.1,
        // ── user-configurable day range ──
        rangeMin: 30,
        rangeMax: 365,
        rangeDefault: 60,
        rangeLabel: "30–365 giorni",
    },
};

/** Safe accessor — always returns a valid profile. */
export const getProfile = (horizon) =>
    HORIZON_PROFILES[horizon] || HORIZON_PROFILES.medium;

/**
 * Return a copy of the profile for `id` where `steps` is replaced by
 * `customDays` and `bars` is scaled proportionally to preserve the
 * look-back / forecast-length ratio defined in the base profile.
 */
export const computeScaledProfile = (id, customDays) => {
    const base = getProfile(id);
    const ratio = customDays / base.rangeDefault;
    return {
        ...base,
        steps: customDays,
        bars: Math.max(20, Math.round(base.bars * ratio)),
    };
};

/** Ordered options for the global dropdown selector. */
export const HORIZON_OPTIONS = HORIZON_ORDER.map((id) => {
    const p = HORIZON_PROFILES[id];
    return { id, label: p.label, sub: p.tag, accent: p.accent };
});

/** Clamp helper reused by the horizon-aware generators. */
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
