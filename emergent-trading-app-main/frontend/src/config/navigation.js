/**
 * navigation.js
 * ────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the sidebar navigation + the model "rooms".
 * The router (App.js) and the Sidebar both consume this so adding a model is a
 * one-entry change. `status` drives the LIVE / BETA / R&D badges.
 */

import {
    LayoutDashboard,
    CandlestickChart,
    Grid3x3,
    Waves,
    BellRing,
    BookOpen,
    Layers,
    Network,
    Box,
    Radar,
    Briefcase,
    Settings,
    Spline,
    GitBranch,
    Shapes,
    Workflow,
    AudioWaveform,
    FlaskConical,
} from "lucide-react";

/**
 * @typedef {Object} NavItem
 * @property {string} id
 * @property {string} path
 * @property {string} label
 * @property {string} short    monospace sidebar caption
 * @property {React.ComponentType} icon
 * @property {"live"|"beta"|"rnd"} status
 */

/** @type {{title:string, items:NavItem[]}[]} */
export const NAV_SECTIONS = [
    {
        title: "Command",
        items: [
            {
                id: "master",
                path: "/",
                label: "Master Quant Dashboard",
                short: "Systemic risk hub",
                icon: LayoutDashboard,
                status: "mock",
            },
        ],
    },
    {
        title: "Modelli Operativi",
        items: [
            {
                id: "swda",
                path: "/swda-supports",
                label: "Historical Supports",
                short: "OHLC · S/R levels",
                icon: CandlestickChart,
                status: "live",
            },
            {
                id: "matrix",
                path: "/support-matrix",
                label: "Support Probability Matrix",
                short: "P(S | t, T) · survival",
                icon: Grid3x3,
                status: "live",
            },
            {
                id: "sde",
                path: "/sde-forecast",
                label: "Ensemble SDE Forecast",
                short: "GBM · OU · Jump",
                icon: Waves,
                status: "live",
            },
            {
                id: "alerts",
                path: "/alert-engine",
                label: "Risk Alert Engine",
                short: "Conditional rules",
                icon: BellRing,
                status: "beta",
            },
            {
                id: "backtest",
                path: "/backtest",
                label: "Walk-Forward Backtest",
                short: "Out-of-sample validation",
                icon: FlaskConical,
                status: "live",
                badge: "VALIDAZIONE",
            },
            {
                id: "convergence",
                path: "/convergence",
                label: "Convergenza Segnali",
                short: "5 modelli · sintesi",
                icon: Layers,
                status: "live",
                badge: "SINTESI",
            },
        ],
    },
    {
        title: "Topology & PDE — R&D",
        items: [
            {
                id: "neighborhoods",
                path: "/topological-neighborhoods",
                label: "Topological Neighborhoods",
                short: "Delay embedding · PH",
                icon: Network,
                status: "mock",
            },
            {
                id: "pde",
                path: "/pde-surface",
                label: "PDE Density Surface",
                short: "u(X, T) evolution",
                icon: Box,
                status: "mock",
            },
            {
                id: "regime",
                path: "/regime-detection",
                label: "Topological Regime",
                short: "Structural breaks",
                icon: Radar,
                status: "mock",
            },
        ],
    },
    {
        title: "Geometria & Algebra — R&D",
        items: [
            {
                id: "clique",
                path: "/clique-homology",
                label: "Clique Complex & Homology",
                short: "β₀, β₁ · persistent",
                icon: Spline,
                status: "mock",
            },
            {
                id: "sheaf",
                path: "/sheaf-cohomology",
                label: "Sheaf Cohomology",
                short: "H¹(𝒳,ℱ) · obstruction",
                icon: GitBranch,
                status: "live",
            },
            {
                id: "scheme",
                path: "/affine-scheme",
                label: "Affine Scheme Microstructure",
                short: "Spec(R) · singularities",
                icon: Shapes,
                status: "mock",
            },
            {
                id: "hodge",
                path: "/hodge-decomposition",
                label: "Hodge Flow Decomposition",
                short: "grad · curl · harmonic",
                icon: Workflow,
                status: "mock",
            },
            {
                id: "spectrum",
                path: "/quantum-graph-spectrum",
                label: "Quantum Graph Spectrum",
                short: "RMT · spectral density",
                icon: AudioWaveform,
                status: "mock",
            },
        ],
    },
    {
        title: "Account",
        items: [
            {
                id: "journal",
                path: "/journal",
                label: "Journal Analisi",
                short: "Snapshot · note · outcome",
                icon: BookOpen,
                status: "live",
                badge: "JOURNAL",
            },
            {
                id: "portfolio",
                path: "/portfolio",
                label: "Portfolio",
                short: "Positions · capital",
                icon: Briefcase,
                status: "live",
            },
            {
                id: "settings",
                path: "/settings",
                label: "Settings",
                short: "Broker · watchlist",
                icon: Settings,
                status: "live",
            },
        ],
    },
];

/** Flat list of all routable nav items. */
export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
