/**
 * Mock data generator for the Topological Analysis view.
 *
 * Used when the backend is unreachable or the TDA endpoints return
 * an error, so the UI stays visible and testable.
 */

function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

export function buildMockFnn() {
    const dMax = 10;
    const chart_fnn = Array.from({ length: dMax }, (_, i) => {
        const d = i + 1;
        // Decreasing curve (Kennel criterion)
        const fnn_pct = Math.max(0.005, Math.exp(-0.55 * (d - 1)) - 0.02);
        return { d, fnn_pct: Number(fnn_pct.toFixed(4)), label: `d=${d}` };
    });
    const chart_cao = Array.from({ length: dMax }, (_, i) => {
        const d = i + 1;
        const E1 = 0.6 + (1 - 0.6) * (1 - Math.exp(-0.5 * d));
        const Estar = d === 1 ? null : 0.5 + (1 - 0.5) * (1 - Math.exp(-0.45 * (d - 1)));
        return {
            d,
            E1: Number(E1.toFixed(4)),
            Estar: Estar === null ? null : Number(Estar.toFixed(4)),
        };
    });
    return {
        status: "ok",
        module: "fnn",
        mocked: true,
        data: {
            d_recommended: 4,
            d_star_kennel: 4,
            d_star_cao: 4,
            tau_used: 3,
            chart_fnn,
            chart_cao,
            summary: {
                interpretation:
                    "Mocked sample · Optimal embedding d* = 4. Kennel criterion stabilizes at d=4 (FNN % drops below 1%). Cao's E* converges to 1.0 from d=4 onward — confirming deterministic structure.",
                warning: null,
            },
        },
    };
}

export function buildMockMapper(seed = 7) {
    const rand = seededRandom(seed);
    const N = 24;
    const nodes = Array.from({ length: N }, (_, i) => ({
        id: `n_${i}`,
        size: 4 + Math.floor(rand() * 20),
        color: Number(rand().toFixed(3)),
        pts: [],
    }));
    const edges = [];
    for (let i = 0; i < N - 1; i++) {
        edges.push({ source: `n_${i}`, target: `n_${i + 1}` });
        if (rand() > 0.6) {
            const j = Math.floor(rand() * N);
            if (j !== i) edges.push({ source: `n_${i}`, target: `n_${j}` });
        }
    }
    return {
        status: "ok",
        module: "mapper",
        mocked: true,
        data: {
            graph: { nodes, edges },
            meta: {
                n_nodes: N,
                n_edges: edges.length,
                filter: "pca1",
                d_used: 4,
                tau_used: 3,
                color_range: [0, 1],
            },
            filter_series: [],
        },
    };
}

export function buildMockTdaFull(priceSeries = []) {
    const rand = seededRandom(42);
    // Use provided price series if available, otherwise synthesize one
    let prices = priceSeries.length > 0
        ? priceSeries.map((p) => ({ t: p.date, price: p.close }))
        : null;
    if (!prices) {
        prices = [];
        let v = 100;
        for (let i = 0; i < 250; i++) {
            v = v * (1 + (rand() - 0.48) * 0.025);
            prices.push({ t: i, price: Number(v.toFixed(2)) });
        }
    }

    // Create topology series aligned 1:1 with prices for the regime overlay.
    const N = prices.length;
    const topology_series = prices.map((p, i) => {
        // Place a couple of sparse regime bands
        const inBand1 = i > Math.floor(N * 0.35) && i < Math.floor(N * 0.42);
        const inBand2 = i > Math.floor(N * 0.78) && i < Math.floor(N * 0.86);
        const regime = inBand1 || inBand2;
        return {
            t: i,
            date: typeof p.t === "string" ? p.t : null,
            price: p.price,
            Pi_H0: Number((1 + rand() * 0.6).toFixed(3)),
            Pi_H1: Number((0.2 + rand() * 0.4).toFixed(3)),
            E_H0: Number((0.4 + rand() * 0.6).toFixed(3)),
            E_H1: Number((0.1 + rand() * 0.3).toFixed(3)),
            beta_0: 1 + Math.floor(rand() * 3),
            beta_1: Math.floor(rand() * 2),
            eta_0: Number((rand() * 0.3).toFixed(3)),
            eta_1: Number((rand() * 0.2).toFixed(3)),
            regime,
        };
    });

    // GBM simulation cone starting from last real price
    const lastPrice = prices[prices.length - 1].price;
    const horizon = 20;
    const sigma = 0.02;
    const drift = 0.0003;
    const sims_mean = [];
    const sims_q05 = [];
    const sims_q95 = [];
    for (let h = 1; h <= horizon; h++) {
        const mu = lastPrice * Math.exp(drift * h);
        const band = lastPrice * sigma * Math.sqrt(h) * 1.96;
        sims_mean.push(Number(mu.toFixed(2)));
        sims_q05.push(Number((mu - band).toFixed(2)));
        sims_q95.push(Number((mu + band).toFixed(2)));
    }

    const simKey = `t_${N - 1}`;
    return {
        status: "ok",
        module: "tda",
        mocked: true,
        data: {
            topology_series,
            persistence_diagrams: [],
            simulations: {
                [simKey]: {
                    paths_summary: {
                        mean: sims_mean,
                        q05: sims_q05,
                        q95: sims_q95,
                        std: sims_mean.map((_, h) => Number((sigma * Math.sqrt(h + 1)).toFixed(4))),
                    },
                },
            },
            meta: {
                n_timesteps: N,
                tau_used: 3,
                n_sparse: topology_series.filter((s) => s.regime).length,
                windows_sampled: N,
            },
        },
    };
}

/**
 * Volatility color scale: blue (low) → cyan → yellow → red (high)
 * Input v ∈ [0, 1].
 */
export function volatilityColor(v) {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    // Interpolate through 4 stops
    const stops = [
        { p: 0.0, c: [37, 99, 235] },   // blue-600
        { p: 0.4, c: [6, 182, 212] },   // cyan-500
        { p: 0.7, c: [234, 179, 8] },   // yellow-500
        { p: 1.0, c: [239, 68, 68] },   // red-500
    ];
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (clamped >= stops[i].p && clamped <= stops[i + 1].p) {
            lo = stops[i];
            hi = stops[i + 1];
            break;
        }
    }
    const t = (clamped - lo.p) / Math.max(1e-9, hi.p - lo.p);
    const r = Math.round(lo.c[0] + t * (hi.c[0] - lo.c[0]));
    const g = Math.round(lo.c[1] + t * (hi.c[1] - lo.c[1]));
    const b = Math.round(lo.c[2] + t * (hi.c[2] - lo.c[2]));
    return `rgb(${r}, ${g}, ${b})`;
}
