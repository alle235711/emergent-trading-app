/**
 * geometryMock.js
 * ────────────────────────────────────────────────────────────────────────────
 * Deterministic, mathematically-structured mock generators for the geometric &
 * algebraic research rooms (Models 9–13):
 *
 *   9 · Clique Complex & Persistent Homology   (TDA + Graphs)
 *  10 · Sheaf Cohomology on Financial Topologies (Čech / H¹)
 *  11 · Algebraic Geometry of Microstructure   (Affine Schemes, Spec R)
 *  12 · Hodge Decomposition of Network Flows    (discrete Hodge Laplacian)
 *  13 · Spectrum of Operators on Quantum Graphs (Random Matrix Theory)
 *
 * TICKER + HORIZON AWARENESS
 *   Every generator takes the GLOBAL ticker calibration profile (lib/tickers.js)
 *   and the GLOBAL investment horizon (lib/horizon.js). The ticker fixes the
 *   instrument fingerprint (volatility, graph size, connectivity, curvature) and
 *   the horizon re-scales persistence/spread, so all charts change visually and
 *   semantically when either selector changes. All randomness is seeded so
 *   renders are stable across reloads.
 */

import { mulberry32, gaussian } from "./quantMock";
import { getProfile } from "../../lib/horizon";
import { hashSeed } from "../../lib/tickers";

const round = (x, n = 3) => Number((x ?? 0).toFixed(n));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x, 0, 1);

/** Seed combining instrument identity, horizon and a per-model offset. */
function seedFor(ticker, profile, offset) {
    return (hashSeed(ticker.symbol) + profile.seedSalt * 131 + offset) >>> 0;
}

/** Even angular layout on the unit circle (for SVG node graphs). */
function circleLayout(n, phase = -Math.PI / 2) {
    return Array.from({ length: n }, (_, i) => {
        const a = phase + (2 * Math.PI * i) / n;
        return { x: Math.cos(a), y: Math.sin(a) };
    });
}

/** Union-find for connected-component (β₀) counting. */
function makeUF(n) {
    const p = Array.from({ length: n }, (_, i) => i);
    const find = (x) => {
        let r = x;
        while (p[r] !== r) r = p[r];
        while (p[x] !== r) {
            const nx = p[x];
            p[x] = r;
            x = nx;
        }
        return r;
    };
    return {
        find,
        union: (a, b) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) p[ra] = rb;
        },
        components: () => {
            const s = new Set();
            for (let i = 0; i < n; i++) s.add(find(i));
            return s.size;
        },
    };
}

/**
 * Latent-factor affinity (≈ correlation) matrix in [-1,1], symmetric, unit
 * diagonal. Higher `connectivity` widens affinities; higher `vol` adds noise.
 */
function affinityMatrix(rand, n, connectivity, vol) {
    const loads = Array.from({ length: n }, () => [gaussian(rand), gaussian(rand), gaussian(rand) * 0.6]);
    const W = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        W[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
            const dot =
                loads[i][0] * loads[j][0] +
                loads[i][1] * loads[j][1] +
                loads[i][2] * loads[j][2];
            const ni = Math.hypot(...loads[i]);
            const nj = Math.hypot(...loads[j]);
            let rho = dot / (ni * nj);
            // Connectivity lifts the baseline affinity; vol injects noise.
            rho = rho * (0.55 + connectivity * 0.6) + gaussian(rand) * vol * 0.18;
            rho = clamp(rho, -0.97, 0.97);
            W[i][j] = rho;
            W[j][i] = rho;
        }
    }
    return W;
}

// ─── 9 · Clique Complex & Persistent Homology ────────────────────────────────

/**
 * Persistent homology of the clique (Vietoris–Rips) complex induced by a
 * weighted adjacency matrix. Distance d_ij = 1 − |ρ_ij|. As the filtration
 * threshold ε grows, edges appear (d ≤ ε), triangles fill in, and the Betti
 * numbers evolve:
 *   β₀(ε)  via union-find on the active 1-skeleton
 *   β₁(ε)  = β₀ − χ,  χ = V − E + F   (Euler characteristic, β₂ ≈ 0)
 *
 * @returns betti curves, the complex at the most-cyclic threshold, and metrics.
 */
export function buildCliqueHomology(ticker, horizon = "medium", profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seedFor(ticker, profile, 9001));
    const n = clamp(ticker.nNodes || 12, 8, 14);
    const labels = (ticker.peers || []).slice(0, n);
    while (labels.length < n) labels.push(`${ticker.symbol}·${labels.length}`);

    const W = affinityMatrix(rand, n, ticker.connectivity, ticker.vol);
    // Distance matrix; longer horizons compress distances (more persistent
    // structure), shorter horizons stretch them (more ephemeral cliques).
    const pm = profile.persistenceMult;
    const D = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            let d = 1 - Math.abs(W[i][j]);
            d = clamp(d ** (0.7 + 0.5 * pm), 0, 1);
            D[i][j] = d;
            D[j][i] = d;
        }
    }

    const STEPS = 44;
    const curve = [];
    for (let s = 0; s <= STEPS; s++) {
        const eps = s / STEPS;
        const uf = makeUF(n);
        let E = 0;
        const active = [];
        for (let i = 0; i < n; i++) {
            active.push(new Array(n).fill(false));
        }
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (D[i][j] <= eps) {
                    E++;
                    active[i][j] = true;
                    active[j][i] = true;
                    uf.union(i, j);
                }
            }
        }
        // Triangles: all three edges present (2-simplices of the clique complex).
        let F = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (!active[i][j]) continue;
                for (let k = j + 1; k < n; k++) {
                    if (active[i][k] && active[j][k]) F++;
                }
            }
        }
        const beta0 = uf.components();
        const chi = n - E + F;
        const beta1 = Math.max(0, beta0 - chi);
        curve.push({ eps: round(eps, 3), beta0, beta1, edges: E, triangles: F });
    }

    // Most-cyclic threshold → the complex we render as a network graph.
    let epsStar = 0.5;
    let maxB1 = 0;
    curve.forEach((c) => {
        if (c.beta1 > maxB1) {
            maxB1 = c.beta1;
            epsStar = c.eps;
        }
    });
    if (maxB1 === 0) epsStar = 0.45;

    const pos = circleLayout(n);
    const nodes = labels.map((label, i) => ({ id: i, label, x: pos[i].x, y: pos[i].y }));
    const edges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (D[i][j] <= epsStar) {
                edges.push({ i, j, w: round(1 - D[i][j], 3) });
            }
        }
    }
    const present = (i, j) => D[i][j] <= epsStar;
    const triangles = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (!present(i, j)) continue;
            for (let k = j + 1; k < n; k++) {
                if (present(i, k) && present(j, k)) triangles.push([i, j, k]);
            }
        }
    }

    // β₁ persistence interval (birth/death of the cyclic regime).
    const b1births = curve.filter((c) => c.beta1 > 0);
    const birth = b1births.length ? b1births[0].eps : null;
    const death = b1births.length ? b1births[b1births.length - 1].eps : null;
    const totalPersistence = round(
        curve.reduce((acc, c) => acc + c.beta1, 0) / STEPS,
        3,
    );

    return {
        n,
        nodes,
        edges,
        triangles,
        curve,
        epsStar,
        metrics: {
            betti0_connected: epsStar,
            max_beta1: maxB1,
            betti1_birth: birth,
            betti1_death: death,
            betti1_persistence: birth != null ? round(death - birth, 3) : 0,
            total_persistence: totalPersistence,
            edges_at_star: edges.length,
            triangles_at_star: triangles.length,
        },
    };
}

// ─── 10 · Sheaf Cohomology on Financial Topologies ───────────────────────────

/**
 * Čech cohomology of a sheaf 𝓕 of market data over a finite cover
 * 𝒳 = ⋃ Uᵢ (the nerve graph). Each open set carries a local section sᵢ
 * (e.g. an implied fair return). Edge transitions gᵢⱼ = (sⱼ − sᵢ) + rᵢⱼ embed a
 * frictional/arbitrage residual rᵢⱼ that is NOT a coboundary. Removing the exact
 * part via a spanning-tree potential leaves the holonomy around each independent
 * cycle = the obstruction class in H¹(𝒳, 𝓕).
 *
 *   dim H¹ = E − V + C   (cyclomatic number of the nerve)
 *   obstruction index ∝ Σ |holonomy|   →  informational inefficiency / arbitrage
 */
export function buildSheafCohomology(ticker, horizon = "medium", profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seedFor(ticker, profile, 10002));
    const m = clamp(Math.round((ticker.nNodes || 12) * 0.6), 6, 8);
    const labels = (ticker.peers || []).slice(0, m).map((p, i) => p || `U${i}`);
    while (labels.length < m) labels.push(`U${labels.length}`);

    const pos = circleLayout(m);
    // Local sections (implied fair returns, %).
    const sections = Array.from({ length: m }, () => round(gaussian(rand) * ticker.vol * 4, 3));

    // Nerve: a covering ring (each Uᵢ overlaps its neighbour) + a few chords so
    // several independent cycles exist (richer H¹).
    const edgeSet = new Set();
    const edges = [];
    const addEdge = (a, b) => {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (edgeSet.has(key) || a === b) return;
        edgeSet.add(key);
        edges.push({ i: Math.min(a, b), j: Math.max(a, b) });
    };
    for (let i = 0; i < m; i++) addEdge(i, (i + 1) % m);
    const nChords = clamp(Math.round(m * ticker.connectivity * 0.9), 1, m - 2);
    for (let c = 0; c < nChords; c++) {
        const a = Math.floor(rand() * m);
        const b = (a + 2 + Math.floor(rand() * (m - 3))) % m;
        addEdge(a, b);
    }

    // Inefficiency scale: short horizons & high vol ⇒ larger obstruction.
    const ineff = clamp(0.35 + ticker.vol * 0.7 + profile.gaugeBias * 1.4, 0.05, 0.95);
    edges.forEach((e) => {
        const coboundary = sections[e.j] - sections[e.i];
        const residual = gaussian(rand) * ineff * 0.9; // non-exact friction term
        e.transition = round(coboundary + residual, 3);
        e._residual = residual;
    });

    // Spanning tree (BFS) → exact potential φ; remove it to expose holonomy.
    const adj = Array.from({ length: m }, () => []);
    edges.forEach((e, idx) => {
        adj[e.i].push({ to: e.j, idx, sign: 1 });
        adj[e.j].push({ to: e.i, idx, sign: -1 });
    });
    const phi = new Array(m).fill(null);
    const treeEdge = new Array(edges.length).fill(false);
    let components = 0;
    for (let start = 0; start < m; start++) {
        if (phi[start] != null) continue;
        components++;
        phi[start] = 0;
        const queue = [start];
        while (queue.length) {
            const u = queue.shift();
            adj[u].forEach(({ to, idx, sign }) => {
                if (phi[to] == null) {
                    phi[to] = phi[u] + sign * edges[idx].transition;
                    treeEdge[idx] = true;
                    queue.push(to);
                }
            });
        }
    }

    // Each non-tree edge closes a fundamental cycle; its holonomy is the
    // obstruction of that loop.
    const cocycles = [];
    edges.forEach((e, idx) => {
        if (treeEdge[idx]) {
            e.obstruction = 0;
            return;
        }
        const hol = e.transition - (phi[e.j] - phi[e.i]);
        e.obstruction = round(hol, 3);
        cocycles.push({ edge: idx, i: e.i, j: e.j, holonomy: round(hol, 3) });
    });

    const h1_dim = edges.length - m + components;
    const obstructionRaw = cocycles.reduce((acc, c) => acc + Math.abs(c.holonomy), 0);
    const obstruction_index = round(clamp01(obstructionRaw / (h1_dim * 1.6 + 0.5)), 3);

    // Obstruction magnitude time series (mean-reverting around the index).
    const series = [];
    let v = obstruction_index;
    for (let t = 0; t < 40; t++) {
        v = clamp01(v + (obstruction_index - v) * 0.18 + gaussian(rand) * 0.05 * (0.5 + ticker.vol));
        series.push({ t, mag: round(v, 4) });
    }

    return {
        m,
        nodes: labels.map((label, i) => ({
            id: i,
            label,
            x: pos[i].x,
            y: pos[i].y,
            section: sections[i],
        })),
        edges,
        cocycles,
        series,
        metrics: {
            h0_dim: components, // global sections (locally-constant pieces)
            h1_dim,
            euler_char: components - h1_dim,
            obstruction_index,
            n_overlaps: edges.length,
            arbitrage: obstruction_index > 0.55,
        },
    };
}

// ─── 11 · Algebraic Geometry of Microstructure (Affine Schemes) ──────────────

/**
 * The market microstructure as an affine scheme Spec(R), R = k[x,y]/(f), with
 * f a deformed Weierstrass cubic
 *      f(x,y) = y² − x³ − a x² − b x
 * whose real points form the price–volume sensitivity locus. The discriminant
 * Δ controls the singularities of V(f):
 *      Δ > 0  → node  (self-intersection: structural inversion)
 *      Δ ≈ 0  → cusp  (degenerate: crash precursor)
 *      Δ < 0  → smooth / isolated point
 * A z-coordinate elevates each point by the (mock) sensitivity ∂P/∂V, producing
 * a 3-D variety point cloud. Extra saddle singularities are seeded by vol.
 */
export function buildAffineScheme(ticker, horizon = "medium", profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seedFor(ticker, profile, 11003));

    // Deformation parameter a: short horizons push toward the singular regime
    // (crash-prone), long horizons smooth the variety.
    const a = round(ticker.curvature * (1.3 - profile.persistenceMult * 0.5) - profile.gaugeBias * 0.8, 3);
    const b = round(0.12 + ticker.vol * 0.25, 3);
    const disc = round(-16 * (4 * a * a * a * b + 27 * b * b) / 100, 3); // ∝ discriminant sign proxy
    const nearNode = a > 0.05;
    const nearCusp = Math.abs(a) <= 0.05;

    // Sample the real curve y² = x³ + a x² + b x, then elevate by sensitivity.
    const points = [];
    const N = 260;
    for (let s = 0; s < N; s++) {
        const x = -1.2 + (2.6 * s) / (N - 1);
        const rhs = x * x * x + a * x * x + b * x;
        if (rhs < 0) continue;
        const y0 = Math.sqrt(rhs);
        [y0, -y0].forEach((y) => {
            const jitter = gaussian(rand) * ticker.vol * 0.04;
            // z = price–volume sensitivity surface ∂P/∂V ≈ ∂f/∂x scaled.
            const z = clamp(
                (3 * x * x + 2 * a * x + b) * 0.4 + jitter,
                -1.6,
                1.6,
            );
            points.push({
                x: round(x, 4),
                y: round(y + jitter, 4),
                z: round(z, 4),
            });
        });
    }

    // Singularities: the origin (node/cusp) + a few vol-seeded saddles.
    const singularities = [];
    singularities.push({
        x: 0,
        y: 0,
        z: round(b * 0.4, 3),
        type: nearCusp ? "cusp" : nearNode ? "node" : "isolated",
        kind: nearCusp ? "crash" : nearNode ? "inversion" : "stable",
        severity: round(clamp01(0.9 - Math.abs(a) * 1.2 + ticker.vol * 0.3), 3),
    });
    const nSaddle = clamp(Math.round(ticker.vol * 4 + profile.gaugeBias * 3), 0, 4);
    for (let s = 0; s < nSaddle; s++) {
        const x = round(-1 + rand() * 2, 3);
        const rhs = Math.max(0, x * x * x + a * x * x + b * x);
        singularities.push({
            x,
            y: round((rand() > 0.5 ? 1 : -1) * Math.sqrt(rhs), 3),
            z: round(gaussian(rand) * 0.5, 3),
            type: "saddle",
            kind: rand() > 0.55 ? "inversion" : "crash",
            severity: round(clamp01(0.3 + rand() * 0.5 + ticker.vol * 0.2), 3),
        });
    }

    const smoothness = round(clamp01(1 - (nearCusp ? 0.7 : nearNode ? 0.45 : 0.2) - ticker.vol * 0.2), 3);

    return {
        params: { a, b, discriminant: disc },
        ring: `k[x,y] / (y² − x³ − ${a}x² − ${b}x)`,
        points,
        singularities,
        metrics: {
            krull_dim: 1, // affine curve
            n_singular: singularities.length,
            discriminant: disc,
            smoothness,
            regime: nearCusp ? "Cuspidal · crash precursor" : nearNode ? "Nodal · structural inversion" : "Smooth · elliptic",
            arithmetic_genus: nearCusp || nearNode ? 0 : 1,
        },
    };
}

// ─── 12 · Hodge Decomposition of Network Flows ───────────────────────────────

/**
 * Discrete Hodge decomposition of the portfolio flow field on the asset graph:
 *      X = grad(p) + curl(A) + h
 * The gradient (curl-free) part is directional TREND, the solenoidal (curl) part
 * is cyclic ARBITRAGE, the harmonic part is the macro EQUILIBRIUM residual.
 * Per-edge components are synthesised directly so the reported percentages and
 * the per-edge bar charts are mutually consistent (fractions = energy share).
 *
 *   short  → solenoidal-heavy (cyclic arbitrage dominates)
 *   medium → balanced
 *   long   → gradient-heavy (persistent trend dominates)
 */
export function buildHodgeDecomposition(ticker, horizon = "medium", profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seedFor(ticker, profile, 12004));
    const n = clamp(ticker.nNodes || 12, 7, 12);
    const labels = (ticker.peers || []).slice(0, n);
    while (labels.length < n) labels.push(`${ticker.symbol}·${labels.length}`);

    // Horizon-dependent component multipliers.
    const mix = {
        short: { g: 0.7, s: 1.6, h: 0.7 },
        medium: { g: 1.0, s: 1.0, h: 0.85 },
        long: { g: 1.7, s: 0.55, h: 1.05 },
    }[profile.id] || { g: 1, s: 1, h: 0.85 };

    const pos = circleLayout(n);
    const potential = Array.from({ length: n }, () => round(gaussian(rand) * mix.g, 3));

    // Build a connected graph (ring + chords) of edges.
    const edges = [];
    const seen = new Set();
    const add = (i, j) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key) || i === j) return;
        seen.add(key);
        edges.push({ i: Math.min(i, j), j: Math.max(i, j) });
    };
    for (let i = 0; i < n; i++) add(i, (i + 1) % n);
    const nChords = clamp(Math.round(n * ticker.connectivity), 1, n);
    for (let c = 0; c < nChords; c++) add(Math.floor(rand() * n), Math.floor(rand() * n));

    let Eg = 0;
    let Es = 0;
    let Eh = 0;
    edges.forEach((e) => {
        const grad = (potential[e.j] - potential[e.i]);
        const curl = gaussian(rand) * mix.s * (0.6 + ticker.vol);
        const harm = gaussian(rand) * mix.h * 0.4;
        e.grad = round(grad, 3);
        e.curl = round(curl, 3);
        e.harm = round(harm, 3);
        e.net = round(grad + curl + harm, 3);
        e.label = `${labels[e.i]}→${labels[e.j]}`;
        Eg += grad * grad;
        Es += curl * curl;
        Eh += harm * harm;
    });
    const total = Eg + Es + Eh || 1;
    const components = {
        gradient: round(Eg / total, 4),
        solenoidal: round(Es / total, 4),
        harmonic: round(Eh / total, 4),
    };

    const topBy = (key) =>
        [...edges]
            .map((e) => ({ label: e.label, value: Math.abs(e[key]) }))
            .sort((x, y) => y.value - x.value)
            .slice(0, 7)
            .map((e) => ({ label: e.label, value: round(e.value, 3) }));

    const dominant =
        components.gradient >= components.solenoidal && components.gradient >= components.harmonic
            ? "Gradient · Trend"
            : components.solenoidal >= components.harmonic
              ? "Solenoidal · Cyclic Arbitrage"
              : "Harmonic · Macro Equilibrium";

    return {
        n,
        nodes: labels.map((label, i) => ({ id: i, label, x: pos[i].x, y: pos[i].y, p: potential[i] })),
        edges,
        components,
        perEdge: {
            gradient: topBy("grad"),
            solenoidal: topBy("curl"),
            harmonic: topBy("harm"),
        },
        metrics: {
            dominant,
            total_energy: round(total, 3),
            trend_strength: components.gradient,
            arbitrage_cycles: clamp(edges.length - n + 1, 0, 99),
            harmonic_rank: components.harmonic > 0.2 ? "elevated" : "low",
        },
    };
}

// ─── 13 · Spectrum of Operators on Quantum Graphs (RMT) ──────────────────────

/** Marchenko–Pastur density at x for ratio q and variance σ². */
function mpDensity(x, q, sigma2) {
    const lm = sigma2 * (1 - Math.sqrt(q)) ** 2;
    const lp = sigma2 * (1 + Math.sqrt(q)) ** 2;
    if (x <= lm || x >= lp) return 0;
    return Math.sqrt((lp - x) * (x - lm)) / (2 * Math.PI * sigma2 * q * x);
}

/**
 * Eigenvalue spectrum of the differential operator defined on the edge metrics
 * of the multi-asset volatility graph. The bulk follows Marchenko–Pastur (RMT
 * null model); a few isolated eigenvalues escape the bulk edge λ₊ — these are
 * the systemic factors (market mode + sectors) and signal structured anomaly.
 *
 *   q = N / T  (aspect ratio, T = horizon look-back window)
 *   bulk ⊂ [λ₋, λ₊] = σ²(1 ∓ √q)²
 */
export function buildQuantumGraphSpectrum(ticker, horizon = "medium", profileOverride = null) {
    const profile = profileOverride ?? getProfile(horizon);
    const rand = mulberry32(seedFor(ticker, profile, 13005));

    const N = clamp(Math.round(40 + ticker.connectivity * 24), 36, 64);
    const T = profile.bars; // look-back window scales with horizon
    const q = round(clamp(N / T, 0.05, 0.95), 3);
    const sigma2 = round(0.6 + ticker.vol * 0.9, 3);
    const lm = sigma2 * (1 - Math.sqrt(q)) ** 2;
    const lp = sigma2 * (1 + Math.sqrt(q)) ** 2;
    const mpMax = mpDensity((lm + lp) / 2, q, sigma2) * 1.25 + 0.05;

    // Rejection-sample the bulk eigenvalues from the MP law.
    const nIsolated = clamp(Math.round(1 + ticker.connectivity * 3 + profile.gaugeBias * 4), 1, 5);
    const nBulk = N - nIsolated;
    const eigenvalues = [];
    let guard = 0;
    while (eigenvalues.length < nBulk && guard < nBulk * 60) {
        guard++;
        const x = lm + rand() * (lp - lm);
        if (rand() * mpMax <= mpDensity(x, q, sigma2)) eigenvalues.push(x);
    }
    // Top-up if rejection under-fills.
    while (eigenvalues.length < nBulk) eigenvalues.push(lm + rand() * (lp - lm));

    // Isolated systemic eigenvalues beyond λ₊ (largest = market mode).
    const isolated = [];
    let base = lp * (1.6 + ticker.vol * 1.2 + Math.max(0, profile.gaugeBias) * 2);
    for (let i = 0; i < nIsolated; i++) {
        const val = round(base, 3);
        isolated.push({
            value: val,
            gap: round(val - lp, 3),
            label: i === 0 ? "Market mode" : `Factor ${i}`,
        });
        eigenvalues.push(val);
        base = lp + (base - lp) * (0.45 + rand() * 0.2);
    }

    // Histogram (density-normalised) + theoretical MP overlay.
    const allMax = Math.max(...eigenvalues, lp);
    const BINS = 34;
    const hiEdge = Math.max(lp * 1.15, allMax * 1.02);
    const binW = hiEdge / BINS;
    const counts = new Array(BINS).fill(0);
    eigenvalues.forEach((v) => {
        const b = clamp(Math.floor(v / binW), 0, BINS - 1);
        counts[b]++;
    });
    const histogram = counts.map((c, i) => {
        const center = (i + 0.5) * binW;
        return {
            x: round(center, 3),
            density: round(c / (eigenvalues.length * binW), 4),
            mp: round(mpDensity(center, q, sigma2), 4),
        };
    });

    const largest = round(Math.max(...eigenvalues), 3);
    const spectralGap = round(largest - lp, 3);

    return {
        params: { N, T, q, sigma2, lambdaMinus: round(lm, 3), lambdaPlus: round(lp, 3) },
        histogram,
        isolated,
        eigenvalues: eigenvalues.map((v) => round(v, 4)).sort((x, y) => x - y),
        metrics: {
            n_isolated: isolated.length,
            largest_eigenvalue: largest,
            spectral_gap: spectralGap,
            bulk_edge: round(lp, 3),
            anomaly: spectralGap > lp * 0.8 || isolated.length >= 3,
            participation: round(clamp01(0.4 + ticker.connectivity * 0.4 - q * 0.2), 3),
        },
    };
}
