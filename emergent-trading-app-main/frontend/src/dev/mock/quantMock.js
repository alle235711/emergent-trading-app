/**
 * quantMock.js
 * ────────────────────────────────────────────────────────────────────────────
 * Deterministic, mathematically-structured mock data generators for the
 * institutional quant desk.
 *
 * Each generator mirrors the JSON contract we expect from the FastAPI backend,
 * so swapping a `buildX()` call for an `await fetchX()` (see src/lib/api.js)
 * is a one-line change per panel. Until the Python solvers are wired in, these
 * functions keep the UI fully presentable while respecting the underlying math:
 *
 *   • SDE ensembles      → log-normal / OU / Merton-jump quantile cones
 *   • Survival analysis  → Kaplan-Meier-style decay of bounce probabilities
 *   • TDA                → persistence pairs (birth ≤ death) above the diagonal
 *   • PDE                → Fokker-Planck / heat-kernel density u(X,T)
 *   • Bayesian filtering → normalised posteriors over discrete regimes
 *
 * All randomness is seeded so renders are stable across reloads (good for
 * screenshots, visual regression and demos).
 *
 * HORIZON AWARENESS
 *   Every generator accepts the GLOBAL investment horizon ("short"|"medium"|
 *   "long"). The horizon profile (see lib/horizon.js) re-parametrises the seed,
 *   realised volatility, forecast length, survival decay, drift and topological
 *   persistence, so all dashboards change visually and semantically when the
 *   user switches regime from the navbar.
 */

import { getProfile, clamp01 } from "../../lib/horizon";

// ─── Deterministic RNG ───────────────────────────────────────────────────────

/** mulberry32 — fast, seedable, decent-quality uniform PRNG in [0,1). */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Box-Muller transform → standard normal N(0,1) from a uniform generator. */
export function gaussian(rand) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Standard normal CDF via Abramowitz-Stegun 7.1.26 erf approximation. */
export function normCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp((-x * x) / 2);
    const p =
        d *
        t *
        (0.3193815 +
            t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

const round = (x, n = 2) => Number(x.toFixed(n));

// ─── 1 · Master Dashboard — systemic risk aggregation ────────────────────────

/**
 * @typedef {Object} BayesianLight
 * @property {string} id
 * @property {string} label
 * @property {number} prior      P(risk) before evidence
 * @property {number} likelihood P(evidence | risk)
 * @property {number} posterior  P(risk | evidence), Bayes-updated
 * @property {"low"|"elevated"|"high"|"critical"} state
 */

/**
 * Aggregated systemic-risk state for the hub.
 * Posteriors come from a 1-step Bayesian update
 *   P(R|E) = P(E|R)·P(R) / [P(E|R)·P(R) + P(E|¬R)·(1−P(R))].
 * @returns {{
 *   bayesianLights: BayesianLight[],
 *   globalVar: { alpha:number, current:{var95:number,var99:number,cvar95:number},
 *                series:{t:number,date:string,var95:number,var99:number,cvar95:number}[] },
 *   regime: { label:string, posterior:number, gauge:number, since:string,
 *             transitions:{from:string,to:string,prob:number}[] },
 *   modules: { id:string, name:string, status:"live"|"beta"|"rnd", health:number }[]
 * }}
 */
export function buildSystemicRiskState(horizon = "medium", seed = 101, profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seed + profile.seedSalt);

    const lightDefs = [
        { id: "support", label: "Support Breakdown", prior: 0.18, like: 0.74, likeNot: 0.21 },
        { id: "regime", label: "Topological Regime Shift", prior: 0.12, like: 0.68, likeNot: 0.14 },
        { id: "vol", label: "Volatility Cluster", prior: 0.27, like: 0.81, likeNot: 0.30 },
        { id: "tail", label: "Tail / Jump Risk", prior: 0.09, like: 0.62, likeNot: 0.11 },
        { id: "liquidity", label: "Liquidity Stress", prior: 0.15, like: 0.55, likeNot: 0.18 },
    ];

    const bayesianLights = lightDefs.map((d) => {
        const jitter = (rand() - 0.5) * 0.06;
        const prior = Math.max(0.02, Math.min(0.6, d.prior + jitter));
        const num = d.like * prior;
        const posteriorRaw = num / (num + d.likeNot * (1 - prior));
        // Horizon bias: short-term emphasises near-term risk, long-term calms it.
        const posterior = clamp01(posteriorRaw + profile.riskBias * 0.6);
        let state = "low";
        if (posterior >= 0.75) state = "critical";
        else if (posterior >= 0.5) state = "high";
        else if (posterior >= 0.3) state = "elevated";
        return {
            id: d.id,
            label: d.label,
            prior: round(prior, 3),
            likelihood: round(d.like, 3),
            posterior: round(posterior, 3),
            state,
        };
    });

    // Global VaR derived from an aggregated GBM with stochastic vol drift.
    const alpha = 0.05;
    const z95 = 1.645;
    const z99 = 2.326;
    const sigmaBase = 0.011 * profile.volMult;
    let sigma = sigmaBase;
    const series = Array.from({ length: 60 }, (_, i) => {
        sigma = Math.max(
            0.006,
            sigma + (sigmaBase - sigma) * 0.05 + gaussian(rand) * 0.0008 * profile.volMult,
        );
        const horizonScale = Math.sqrt(1); // 1-day VaR
        const var95 = z95 * sigma * horizonScale;
        const var99 = z99 * sigma * horizonScale;
        // CVaR (expected shortfall) for normal: φ(z_α)/α · σ
        const cvar95 = (0.10313 / alpha) * sigma; // φ(1.645)=0.10313
        return {
            t: i,
            date: dayLabel(i, 60),
            var95: round(var95 * 100, 3),
            var99: round(var99 * 100, 3),
            cvar95: round(cvar95 * 100, 3),
        };
    });
    const last = series[series.length - 1];

    const regime = {
        label: "Mean-Reverting / Range",
        posterior: round(clamp01(0.63 - profile.gaugeBias), 2),
        gauge: round(clamp01(0.41 + profile.gaugeBias), 3), // 0 = calm, 1 = break
        since: "T−14d",
        transitions: [
            { from: "Range", to: "Trending", prob: 0.22 },
            { from: "Range", to: "High-Vol", prob: 0.19 },
            { from: "Range", to: "Range", prob: 0.59 },
        ],
    };

    const modules = [
        { id: "swda", name: "SWDA Supports", status: "live", health: 0.98 },
        { id: "matrix", name: "Support Matrix", status: "live", health: 0.95 },
        { id: "sde", name: "Ensemble SDE", status: "live", health: 0.93 },
        { id: "alerts", name: "Alert Engine", status: "beta", health: 0.88 },
        { id: "tda", name: "Topological Neighborhoods", status: "rnd", health: 0.61 },
        { id: "pde", name: "PDE Density Surface", status: "rnd", health: 0.54 },
        { id: "regime", name: "Regime Detection", status: "rnd", health: 0.58 },
    ];

    return {
        bayesianLights,
        globalVar: {
            alpha,
            current: { var95: last.var95, var99: last.var99, cvar95: last.cvar95 },
            series,
        },
        regime,
        modules,
    };
}

// ─── 2 · SWDA historical supports — OHLC + S/R levels ────────────────────────

/**
 * Synthesises a realistic OHLC series with soft mean-reversion toward a small
 * set of structural price levels, then extracts those as support/resistance.
 * @param {string} ticker
 * @param {number} n number of daily bars
 */
export function buildSwdaOhlc(ticker = "SWDA.MI", horizon = "medium", seed = 7, profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seed + profile.seedSalt);
    const anchors = [78.0, 82.5, 86.0, 90.0, 94.5]; // structural levels
    const n = profile.bars; // look-back window scales with horizon
    let price = 86.0;
    const start = new Date();
    start.setDate(start.getDate() - n);

    const candles = [];
    for (let i = 0; i < n; i++) {
        // Pull toward nearest anchor (range-bound ETF behaviour) + GBM noise.
        const nearest = anchors.reduce((a, b) =>
            Math.abs(b - price) < Math.abs(a - price) ? b : a,
        );
        const pull = (nearest - price) * 0.015;
        const drift = 0.0002 + profile.drift;
        const shock = gaussian(rand) * price * 0.009 * profile.volMult;
        const open = price;
        const close = Math.max(40, open + pull + drift * open + shock);
        const wickUp = Math.abs(gaussian(rand)) * price * 0.006;
        const wickDn = Math.abs(gaussian(rand)) * price * 0.006;
        const high = Math.max(open, close) + wickUp;
        const low = Math.min(open, close) - wickDn;
        const volume = Math.round(8e5 + Math.abs(gaussian(rand)) * 4e5);
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        candles.push({
            date: d.toISOString().slice(0, 10),
            t: i,
            open: round(open),
            high: round(high),
            low: round(low),
            close: round(close),
            volume,
        });
        price = close;
    }

    // S/R: anchors that the price touched (within band) ≥ minTouches times.
    const band = 0.6;
    const levels = anchors
        .map((lvl) => {
            const touches = candles.filter(
                (c) => c.low - band <= lvl && c.high + band >= lvl,
            ).length;
            const type = lvl <= price ? "support" : "resistance";
            return {
                price: lvl,
                type,
                touches,
                strength: Math.min(1, touches / 40),
                confidence: round(0.55 + Math.min(0.4, touches / 80), 2),
            };
        })
        .filter((l) => l.touches >= 4);

    const lastClose = candles[candles.length - 1].close;

    return {
        ticker,
        currency: "EUR",
        lastClose,
        candles,
        levels,
        meta: {
            method: "fractal pivots + KDE clustering on OHLCV",
            min_touches: 4,
            band_pct: round((band / lastClose) * 100, 2),
        },
    };
}

// ─── 4 · Support probability matrix — P(S | t, T) survival ───────────────────

export const HORIZONS = [1, 3, 5, 10, 20];
export const HORIZON_LABELS = ["1d", "3d", "5d", "10d", "20d"];

/**
 * Conditional bounce probability matrix with temporal decay + bootstrap CI.
 * Shape matches the live /api/market/support-matrix contract used by
 * SupportMatrixPanel, so this is a drop-in mock fallback.
 * @returns {{
 *   levels:number[], P:number[][], CI_low:number[][], CI_high:number[][],
 *   P_KM:number[][], P_decay:number[][], n_touches:number[], risk_score:number[]
 * }}
 */
export function buildSupportProbabilityMatrix(horizon = "medium", seed = 21, profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seed + profile.seedSalt);
    const levels = [78.0, 82.5, 86.0, 90.0, 94.5];

    const P = [];
    const CI_low = [];
    const CI_high = [];
    const P_KM = [];
    const P_decay = [];
    const n_touches = [];
    const risk_score = [];

    levels.forEach((lvl, i) => {
        const touches = 6 + Math.floor(rand() * 30);
        n_touches.push(touches);
        // Base bounce probability higher near strong (often-touched) levels.
        const base = 0.5 + Math.min(0.35, touches / 90) + (rand() - 0.5) * 0.1;
        const rowP = [];
        const rowLo = [];
        const rowHi = [];
        const rowKM = [];
        const rowDecay = [];
        HORIZONS.forEach((T) => {
            // Survival decay: bounce probability decays ~ exp(-λT). The horizon
            // profile scales λ — short regimes decay fast, long regimes hold.
            const lambda = (0.045 + rand() * 0.02) * profile.lambdaMult;
            const p = Math.max(0.02, Math.min(0.98, base * Math.exp(-lambda * T)));
            // Bootstrap CI width shrinks with touches (∝ 1/√n).
            const se = 0.5 / Math.sqrt(touches) + 0.01;
            rowP.push(round(p, 3));
            rowLo.push(round(Math.max(0, p - 1.96 * se), 3));
            rowHi.push(round(Math.min(1, p + 1.96 * se), 3));
            rowKM.push(round(Math.max(0.02, p * (0.96 + rand() * 0.08)), 3));
            rowDecay.push(round(lambda, 4));
        });
        P.push(rowP);
        CI_low.push(rowLo);
        CI_high.push(rowHi);
        P_KM.push(rowKM);
        P_decay.push(rowDecay);
        // Risk score = P(break) at the 20d horizon, weighted by proximity.
        risk_score.push(round(1 - rowP[rowP.length - 1], 3));
    });

    return { levels, P, CI_low, CI_high, P_KM, P_decay, n_touches, risk_score };
}

// ─── 5 · Topological neighborhoods — persistence diagrams ────────────────────

/**
 * @typedef {Object} PersistencePair
 * @property {number} birth
 * @property {number} death
 * @property {number} dim       homology dimension (0 = components, 1 = loops)
 * @property {number} persistence death − birth
 */

/**
 * Persistent homology of a delay-embedded local trajectory.
 * Generates birth-death pairs strictly above the diagonal (death ≥ birth),
 * plus a "local evolution" stability score for the topological ball.
 */
export function buildPersistenceDiagram(horizon = "medium", seed = 33, profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seed + profile.seedSalt);
    const pm = profile.persistenceMult; // longer horizons → more robust structure

    /** @type {PersistencePair[]} */
    const pairs = [];
    // H0: many short-lived components + a couple of persistent ones.
    const n0 = 18;
    for (let i = 0; i < n0; i++) {
        const birth = 0;
        const isInfinite = i === 0;
        const death = isInfinite
            ? 1.0
            : round(Math.min(0.98, (0.02 + rand() * (i < 3 ? 0.55 : 0.18)) * pm), 3);
        pairs.push({ birth, death, dim: 0, persistence: round(death - birth, 3) });
    }
    // H1: a few loops, two of them salient (robust cyclic structure).
    const n1 = 7;
    for (let i = 0; i < n1; i++) {
        const birth = round(0.1 + rand() * 0.4, 3);
        const span = (i < 2 ? 0.25 + rand() * 0.3 : rand() * 0.12) * pm;
        const death = round(birth + span, 3);
        pairs.push({ birth, death, dim: 1, persistence: round(death - birth, 3) });
    }

    const h1 = pairs.filter((p) => p.dim === 1);
    const maxPers = Math.max(...h1.map((p) => p.persistence));
    // Local evolution = stability of the topological ball as embedding window
    // rolls forward. High = robust local geometry.
    const localEvolution = round(0.5 + maxPers * 0.7, 3);

    return {
        pairs,
        embedding: {
            tau: 3, // delay
            d: 4, // embedding dimension
            epsilon: 0.18, // euclidean ball radius
            n_neighbors: 26,
            window: 100,
        },
        metrics: {
            local_evolution: Math.min(0.99, localEvolution),
            betti_0: pairs.filter((p) => p.dim === 0 && p.persistence > 0.1).length,
            betti_1: h1.filter((p) => p.persistence > 0.1).length,
            max_persistence_h1: round(maxPers, 3),
            total_persistence: round(
                pairs.reduce((s, p) => s + p.persistence, 0),
                3,
            ),
        },
    };
}

// ─── 6 · Ensemble SDE forecast — GBM / OU / Jump-diffusion ───────────────────

/**
 * Builds quantile cones (5/25/50/75/95) for three SDE families plus the
 * particle-filter-weighted ensemble, a model-weight time series, and a
 * dynamic VaR curve.
 * @param {number} s0  spot price
 * @param {number} horizon forecast steps (days)
 */
export function buildEnsembleForecast(s0 = 86.0, horizon = 30, regime = "medium", seed = 55) {
    const profile = getProfile(regime);
    const rand = mulberry32(seed + profile.seedSalt);
    const vm = profile.volMult;

    // Analytic GBM quantiles: S_T = S0·exp((μ−σ²/2)T + σ√T·z_q).
    const gbm = sdeCone(s0, horizon, {
        kind: "gbm",
        mu: 0.06 / 252 + profile.drift * 0.5,
        sigma: 0.012 * vm,
    });
    // Ornstein-Uhlenbeck (mean-reverting) around theta.
    const ou = sdeCone(s0, horizon, {
        kind: "ou",
        theta: 88.0,
        kappa: 0.05,
        sigma: 0.9 * vm,
    });
    // Merton jump-diffusion: GBM + compound Poisson jumps.
    const jump = sdeCone(s0, horizon, {
        kind: "jump",
        mu: 0.05 / 252 + profile.drift * 0.5,
        sigma: 0.011 * vm,
        lambda: 0.03 * profile.lambdaMult,
        jumpMean: -0.015,
        jumpStd: 0.02 * vm,
    });

    // Particle-filter model weights evolving over the rolling window.
    const weights = [];
    let wg = 0.5;
    let wo = 0.3;
    let wj = 0.2;
    for (let i = 0; i < horizon; i++) {
        wg = Math.max(0.05, wg + gaussian(rand) * 0.02);
        wo = Math.max(0.05, wo + gaussian(rand) * 0.02);
        wj = Math.max(0.05, wj + gaussian(rand) * 0.015);
        const z = wg + wo + wj;
        weights.push({
            t: i + 1,
            gbm: round(wg / z, 3),
            ou: round(wo / z, 3),
            jump: round(wj / z, 3),
        });
    }
    const lastW = weights[weights.length - 1];

    // Ensemble = weight-blended quantiles.
    const ensemble = gbm.map((g, i) => {
        const o = ou[i];
        const j = jump[i];
        const blend = (key) =>
            round(lastW.gbm * g[key] + lastW.ou * o[key] + lastW.jump * j[key], 3);
        return {
            t: g.t,
            q05: blend("q05"),
            q25: blend("q25"),
            q50: blend("q50"),
            q75: blend("q75"),
            q95: blend("q95"),
        };
    });

    // Dynamic VaR/CVaR from the ensemble lower tail vs spot.
    const dynamicVar = ensemble.map((e) => {
        const loss95 = Math.max(0, (s0 - e.q05) / s0);
        const loss99 = Math.max(0, (s0 - e.q05 * 0.985) / s0);
        return {
            t: e.t,
            horizon: `${e.t}d`,
            var95: round(loss95 * 100, 3),
            var99: round(loss99 * 100, 3),
            cvar95: round(loss95 * 1.28 * 100, 3),
        };
    });

    return {
        s0,
        horizon,
        models: { gbm, ou, jump },
        ensemble,
        weights,
        dynamicVar,
        particle_filter: {
            n_particles: 2000,
            effective_sample_size: round(820 + rand() * 400, 1),
            rolling_window: 60,
            model_weights: { gbm: lastW.gbm, ou: lastW.ou, jump: lastW.jump },
        },
    };
}

/** Generic quantile-cone builder for the three SDE families. */
function sdeCone(s0, horizon, params) {
    const zq = { q05: -1.645, q25: -0.674, q50: 0, q75: 0.674, q95: 1.645 };
    const out = [];
    out.push({ t: 0, q05: s0, q25: s0, q50: s0, q75: s0, q95: s0 });
    for (let h = 1; h <= horizon; h++) {
        let center;
        let spread;
        if (params.kind === "gbm" || params.kind === "jump") {
            const { mu, sigma } = params;
            center = s0 * Math.exp((mu - (sigma * sigma) / 2) * h);
            spread = sigma * Math.sqrt(h);
            if (params.kind === "jump") {
                // Add jump-induced variance + negative skew to the mean.
                const { lambda, jumpMean, jumpStd } = params;
                center *= Math.exp(lambda * h * jumpMean);
                spread = Math.sqrt(
                    spread * spread + lambda * h * (jumpStd * jumpStd + jumpMean * jumpMean),
                );
            }
            const row = { t: h };
            Object.entries(zq).forEach(([k, z]) => {
                row[k] = round(center * Math.exp(z * spread), 3);
            });
            out.push(row);
        } else {
            // OU: mean E[X_T]=θ+(X0−θ)e^{−κT}; Var=σ²/(2κ)(1−e^{−2κT}).
            const { theta, kappa, sigma } = params;
            center = theta + (s0 - theta) * Math.exp(-kappa * h);
            const varT = ((sigma * sigma) / (2 * kappa)) * (1 - Math.exp(-2 * kappa * h));
            const sd = Math.sqrt(varT);
            const row = { t: h };
            Object.entries(zq).forEach(([k, z]) => {
                row[k] = round(center + z * sd, 3);
            });
            out.push(row);
        }
    }
    return out;
}

// ─── 7 · PDE density surface — u(X, T) ───────────────────────────────────────

/**
 * Solves (mock) a parabolic Fokker-Planck / heat equation
 *   ∂u/∂T = ½σ²X² ∂²u/∂X² − μX ∂u/∂X
 * giving a price-density surface that diffuses and drifts over the horizon.
 * Each time column is normalised to integrate to ~1 (valid pdf).
 * @returns {{
 *   X:number[], T:number[], U:number[][], meta:object
 * }}
 */
export function buildPdeSurface(s0 = 86.0, horizon = "medium", seed = 88, profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const nx = 48; // price grid
    const nt = 40; // time grid
    const xMin = s0 * 0.7;
    const xMax = s0 * 1.3;
    const X = Array.from({ length: nx }, (_, i) => round(xMin + ((xMax - xMin) * i) / (nx - 1), 2));
    const T = Array.from({ length: nt }, (_, j) => j + 1);

    const sigma = round(0.16 * profile.volMult, 4); // annualised vol (horizon-scaled)
    const mu = round(0.05 + profile.drift * 252 * 0.4, 4);
    const U = [];
    for (let i = 0; i < nx; i++) {
        const row = [];
        for (let j = 0; j < nt; j++) {
            const t = (j + 1) / nt; // normalised time ∈ (0,1]
            // Log-normal transition density of GBM (analytic Green's function).
            const x = X[i];
            const m = Math.log(s0) + (mu - 0.5 * sigma * sigma) * t;
            const v = sigma * sigma * t;
            const lnx = Math.log(x);
            const dens =
                (1 / (x * Math.sqrt(2 * Math.PI * v))) *
                Math.exp(-((lnx - m) * (lnx - m)) / (2 * v));
            row.push(dens);
        }
        U.push(row);
    }

    // Column-normalise to unit mass (numerical pdf).
    for (let j = 0; j < nt; j++) {
        let s = 0;
        for (let i = 0; i < nx; i++) s += U[i][j];
        for (let i = 0; i < nx; i++) U[i][j] = round(U[i][j] / (s || 1), 6);
    }

    return {
        X,
        T,
        U,
        meta: {
            scheme: "implicit Crank-Nicolson (θ=0.5)",
            equation: "∂u/∂T = ½σ²X²∂²u/∂X² − μX∂u/∂X",
            sigma,
            mu,
            dx: round((xMax - xMin) / (nx - 1), 3),
            dt: round(1 / nt, 4),
            stability: "unconditionally stable (implicit)",
            s0,
        },
    };
}

// ─── 8 · Topological regime detection — correlation + gauge ──────────────────

/**
 * Multi-asset correlation matrix + Bayesian regime classifier output.
 * The correlation matrix is built PSD-by-construction from latent factors,
 * then a TDA filtration threshold + posterior over regimes is attached.
 */
export function buildRegimeState(horizon = "medium", seed = 99, profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seed + profile.seedSalt);
    const assets = ["SWDA", "SPY", "AGG", "GLD", "BTC", "VIX", "EURUSD", "TLT"];
    const k = assets.length;

    // Latent 2-factor loadings → correlation = normalised LLᵀ.
    const loads = assets.map(() => [gaussian(rand), gaussian(rand)]);
    const corr = [];
    for (let i = 0; i < k; i++) {
        const row = [];
        for (let j = 0; j < k; j++) {
            if (i === j) {
                row.push(1);
            } else {
                const dot = loads[i][0] * loads[j][0] + loads[i][1] * loads[j][1];
                const ni = Math.hypot(loads[i][0], loads[i][1]);
                const nj = Math.hypot(loads[j][0], loads[j][1]);
                row.push(round(Math.max(-0.95, Math.min(0.95, dot / (ni * nj))), 2));
            }
        }
        corr.push(row);
    }

    // Posterior mass shifts with horizon: short → more Stress/Break weight,
    // long → more Range/structural calm. Re-normalised to sum to 1.
    const b = profile.gaugeBias;
    const rawRegimes = [
        { label: "Risk-On / Trending", posterior: 0.21 + Math.max(0, b) * 0.4 },
        { label: "Range / Mean-Reverting", posterior: 0.58 - b * 1.2 },
        { label: "Risk-Off / Stress", posterior: clamp01(0.15 + b * 0.9) },
        { label: "Structural Break", posterior: clamp01(0.06 + b * 0.7) },
    ];
    const zReg = rawRegimes.reduce((s, r) => s + Math.max(0.01, r.posterior), 0);
    const regimes = rawRegimes.map((r) => ({
        label: r.label,
        posterior: round(Math.max(0.01, r.posterior) / zReg, 2),
    }));

    // Regime-change gauge ∈ [0,1] driven by the structural-break posterior
    // amplified by topological persistence of the correlation network.
    const gauge = round(clamp01(0.32 + rand() * 0.18 + b), 3);

    // Regime timeline (last 30 sessions) for the strip chart.
    const timeline = Array.from({ length: 30 }, (_, i) => {
        const r = rand();
        const label =
            r > 0.85 ? "Stress" : r > 0.55 ? "Range" : r > 0.2 ? "Trending" : "Range";
        return { t: i, date: dayLabel(i, 30), regime: label, score: round(r, 3) };
    });

    return {
        assets,
        corr,
        regimes,
        gauge,
        timeline,
        tda: {
            filtration: "Vietoris-Rips on 1−|ρ| distance",
            threshold: 0.42,
            persistence_entropy: round(1.4 + rand() * 0.6, 3),
            wasserstein_drift: round(0.08 + rand() * 0.05, 3),
        },
        classifier: {
            model: "Gaussian Naive Bayes over persistence features",
            confidence: 0.71,
            alert: gauge > 0.6,
        },
    };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function dayLabel(i, n) {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(5, 10); // MM-DD
}

// ─── alert engine — seed rules ───────────────────────────────────────────────

/**
 * @typedef {Object} AlertRule
 * @property {string} id
 * @property {string} name
 * @property {boolean} enabled
 * @property {"AND"|"OR"} logic
 * @property {{ metric:string, operator:string, value:number }[]} conditions
 * @property {string} action
 * @property {"info"|"warning"|"critical"} severity
 */

/**
 * @param {"short"|"medium"|"long"} horizon
 * @returns {AlertRule[]}
 *
 * Thresholds scale with the horizon: short regimes arm tighter, more reactive
 * VaR triggers; long regimes loosen them and keep only structural rules armed.
 */
export function buildSeedAlertRules(horizon = "medium", profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    // VaR threshold widens with realised vol so the alert stays calibrated.
    const varTh = round(2.5 * profile.volMult, 2);
    const cvarTh = round(3.2 * profile.volMult, 2);
    return [
        {
            id: "rule-1",
            name: "Support breakdown + low topological persistence",
            enabled: true,
            logic: "AND",
            severity: "critical",
            conditions: [
                { metric: "P_break_support", operator: ">", value: 0.8 },
                { metric: "topological_persistence", operator: "<", value: 0.15 },
            ],
            action: "notify_email + flatten_exposure",
        },
        {
            id: "rule-2",
            name: "VaR(95) spike",
            enabled: horizon !== "long",
            logic: "OR",
            severity: "warning",
            conditions: [
                { metric: "var_95", operator: ">", value: varTh },
                { metric: "cvar_95", operator: ">", value: cvarTh },
            ],
            action: "notify_push",
        },
        {
            id: "rule-3",
            name: "Structural regime change detected",
            enabled: horizon === "long",
            logic: "AND",
            severity: "critical",
            conditions: [
                { metric: "regime_gauge", operator: ">", value: 0.6 },
                { metric: "regime_posterior", operator: ">", value: 0.5 },
            ],
            action: "notify_email + webhook",
        },
    ];
}

/** Catalogue of metrics selectable in the rule builder. */
export const ALERT_METRICS = [
    { id: "P_break_support", label: "P(rottura supporto)", unit: "prob" },
    { id: "topological_persistence", label: "Persistenza topologica (H1)", unit: "" },
    { id: "var_95", label: "VaR 95%", unit: "%" },
    { id: "cvar_95", label: "CVaR 95%", unit: "%" },
    { id: "regime_gauge", label: "Regime gauge", unit: "0-1" },
    { id: "regime_posterior", label: "Regime posterior", unit: "prob" },
    { id: "local_evolution", label: "Evoluzione locale (TDA)", unit: "0-1" },
    { id: "jump_intensity", label: "Intensità salti λ", unit: "" },
];

export const ALERT_OPERATORS = [">", ">=", "<", "<=", "==", "crosses"];
