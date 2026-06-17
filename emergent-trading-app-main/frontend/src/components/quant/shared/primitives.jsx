/**
 * primitives.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Reusable, framework-agnostic building blocks for the quant desk dashboards.
 * Institutional dark theme: deep navy / slate surfaces, teal accent, flat 1px
 * borders, monospace data. Every primitive is presentational and prop-driven so
 * pages stay declarative and the same vocabulary is reused across all 8 rooms.
 */

import React from "react";

// Shared palette tokens (kept in JS so charts + inline styles can reuse them).
export const PALETTE = {
    bg: "#070B14",
    surface: "#0E1422",
    surfaceAlt: "#0A0F1C",
    border: "#1B2335",
    borderStrong: "#2A3550",
    text: "#E6EAF2",
    muted: "#64748B",
    accent: "#00E5C0",
    blue: "#4F8BFF",
    purple: "#A78BFA",
    warn: "#FFB020",
    danger: "#FF4D5E",
    positive: "#00E5C0",
};

/** Map a semantic tone to a hex colour. */
export function toneColor(tone) {
    switch (tone) {
        case "positive":
            return PALETTE.positive;
        case "negative":
        case "critical":
            return PALETTE.danger;
        case "warning":
        case "high":
        case "elevated":
            return PALETTE.warn;
        case "accent":
            return PALETTE.accent;
        case "info":
            return PALETTE.blue;
        default:
            return PALETTE.text;
    }
}

/**
 * Section/page header with mono kicker, title and optional right-side actions.
 */
export const PageHeader = ({ kicker, title, accent, description, actions }) => (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
            {kicker ? (
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
                    // {kicker}
                </div>
            ) : null}
            <h1 className="text-2xl sm:text-3xl lg:text-[2.1rem] tracking-tight font-medium leading-tight text-slate-100">
                {title} {accent ? <span className="text-[#00E5C0]">{accent}</span> : null}
            </h1>
            {description ? (
                <p className="mt-3 text-sm text-slate-400 max-w-2xl leading-relaxed">
                    {description}
                </p>
            ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
);

/**
 * Flat bordered panel. The canonical container for every widget.
 */
export const Panel = ({
    title,
    subtitle,
    actions,
    badge,
    className = "",
    bodyClassName = "",
    children,
    testId,
}) => (
    <section
        data-testid={testId}
        className={`border border-[#1B2335] bg-[#0E1422] ${className}`}
    >
        {(title || actions || badge) && (
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#1B2335]">
                <div className="min-w-0">
                    {title ? (
                        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-slate-400">
                            {title}
                        </div>
                    ) : null}
                    {subtitle ? (
                        <div className="text-[11px] font-mono text-slate-600 mt-1 truncate">
                            {subtitle}
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {badge}
                    {actions}
                </div>
            </div>
        )}
        <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
);

/**
 * Status badge — live / mock / error / beta / rnd.
 * @param {{status:"live"|"mock"|"error"|"beta"|"rnd"}} props
 */
export const StatusBadge = ({ status = "live", className = "" }) => {
    const map = {
        live: { label: "LIVE", c: "#00E5C0", dot: true },
        mock: { label: "MOCK", c: "#FFB020", dot: true },
        error: { label: "ERROR", c: "#FF4D5E", dot: true },
        beta: { label: "BETA", c: "#4F8BFF", dot: true },
        rnd: { label: "R&D · IN SVILUPPO", c: "#FFB020", dot: false },
    };
    const cfg = map[status] || map.live;
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.2em] border ${className}`}
            style={{ color: cfg.c, borderColor: `${cfg.c}55`, background: `${cfg.c}12` }}
        >
            {cfg.dot ? (
                <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: cfg.c }}
                />
            ) : null}
            {cfg.label}
        </span>
    );
};

/**
 * Bayesian risk light — a "semaforo" with posterior probability.
 * @param {{label:string, posterior:number, prior?:number,
 *          state:"low"|"elevated"|"high"|"critical"}} props
 */
export const RiskLight = ({ label, posterior, prior, state, testId }) => {
    const c = toneColor(state === "low" ? "positive" : state);
    return (
        <div
            data-testid={testId}
            className="border border-[#1B2335] bg-[#0A0F1C] p-4 flex items-center gap-4"
        >
            <div className="relative flex flex-col gap-1.5">
                {["critical", "high", "low"].map((lvl) => {
                    const active =
                        (lvl === "critical" && state === "critical") ||
                        (lvl === "high" && (state === "high" || state === "elevated")) ||
                        (lvl === "low" && state === "low");
                    const lc =
                        lvl === "critical"
                            ? PALETTE.danger
                            : lvl === "high"
                              ? PALETTE.warn
                              : PALETTE.positive;
                    return (
                        <span
                            key={lvl}
                            className="w-3 h-3 rounded-full transition-all duration-300"
                            style={{
                                background: active ? lc : "#1B2335",
                                boxShadow: active ? `0 0 10px ${lc}` : "none",
                            }}
                        />
                    );
                })}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-mono text-slate-300 leading-tight truncate">
                    {label}
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                    <span
                        className="text-xl font-mono font-medium tracking-tight"
                        style={{ color: c }}
                    >
                        {(posterior * 100).toFixed(1)}%
                    </span>
                    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">
                        posterior
                    </span>
                </div>
                {prior != null ? (
                    <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                        prior {(prior * 100).toFixed(1)}% → bayes update
                    </div>
                ) : null}
            </div>
        </div>
    );
};

/**
 * Semicircular gauge for a value ∈ [0,1].
 * @param {{value:number,label:string,size?:number}} props
 */
export const Gauge = ({ value = 0, label, size = 180, testId }) => {
    const v = Math.max(0, Math.min(1, value));
    const r = size * 0.42;
    const cx = size / 2;
    const cy = size / 2;
    const startAngle = Math.PI; // 180°
    const endAngle = 0; // 0°
    const angle = startAngle + (endAngle - startAngle) * v;
    const needleX = cx + r * 0.82 * Math.cos(angle);
    const needleY = cy + r * 0.82 * Math.sin(angle) * -1; // svg y is inverted

    // Arc path helper. We always trace the UPPER semicircle from a0 → a1 with
    // a0 ≥ a1 (angles decreasing from π toward 0). In SVG screen coordinates
    // (y-axis points down) that direction is clockwise → sweep-flag = 1.
    const arc = (a0, a1, radius) => {
        const x0 = cx + radius * Math.cos(a0);
        const y0 = cy - radius * Math.sin(a0);
        const x1 = cx + radius * Math.cos(a1);
        const y1 = cy - radius * Math.sin(a1);
        const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
        return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
    };

    const color = v > 0.66 ? PALETTE.danger : v > 0.4 ? PALETTE.warn : PALETTE.positive;

    return (
        <div data-testid={testId} className="flex flex-col items-center">
            <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
                {/* track */}
                <path
                    d={arc(Math.PI, 0, r)}
                    fill="none"
                    stroke="#1B2335"
                    strokeWidth={10}
                    strokeLinecap="round"
                />
                {/* value arc */}
                <path
                    d={arc(Math.PI, angle, r)}
                    fill="none"
                    stroke={color}
                    strokeWidth={10}
                    strokeLinecap="round"
                />
                {/* needle */}
                <line
                    x1={cx}
                    y1={cy}
                    x2={needleX}
                    y2={needleY}
                    stroke={color}
                    strokeWidth={2}
                />
                <circle cx={cx} cy={cy} r={4} fill={color} />
                <text
                    x={cx}
                    y={cy - 14}
                    textAnchor="middle"
                    fill={color}
                    style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, fontWeight: 600 }}
                >
                    {(v * 100).toFixed(0)}%
                </text>
            </svg>
            {label ? (
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 -mt-2">
                    {label}
                </div>
            ) : null}
        </div>
    );
};

/** Compact metric tile (navy variant of the existing MetricCard). */
export const StatTile = ({ label, value, sub, tone = "neutral", testId }) => (
    <div
        data-testid={testId}
        className="border border-[#1B2335] bg-[#0E1422] p-4 sm:p-5 flex flex-col justify-between min-h-[112px] hover:border-[#2A3550] transition-colors duration-150"
    >
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">
            {label}
        </div>
        <div
            className="mt-2 text-2xl sm:text-[1.7rem] font-mono font-medium tracking-tight"
            style={{ color: toneColor(tone) }}
        >
            {value}
        </div>
        {sub ? (
            <div className="mt-1.5 text-[10px] font-mono text-slate-500 tracking-wide">
                {sub}
            </div>
        ) : null}
    </div>
);

/** Inline R&D disclaimer banner for mock/not-yet-implemented models. */
export const RnDBanner = ({ children }) => (
    <div className="border border-[#FFB020]/40 bg-[#FFB020]/[0.06] px-4 py-3 flex items-start gap-3 mb-6">
        <span className="mt-0.5 w-2 h-2 rounded-full bg-[#FFB020] shrink-0 animate-pulse" />
        <p className="text-[11px] font-mono text-[#FFB020]/90 leading-relaxed">
            {children}
        </p>
    </div>
);

/** Tiny mono legend swatch. */
export const Legend = ({ items }) => (
    <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
        {items.map((it) => (
            <span key={it.label} className="flex items-center gap-2">
                <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: it.color }}
                />
                {it.label}
            </span>
        ))}
    </div>
);

export default Panel;
