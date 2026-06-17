/**
 * chartTheme.js
 * ────────────────────────────────────────────────────────────────────────────
 * Shared Recharts styling tokens for the institutional dark desk. Centralised so
 * every research room renders charts with the same axis/tooltip/grid vocabulary.
 */

export const MONO = "JetBrains Mono, monospace";

/** Common axis props (spread into <XAxis {...axisCommon} />). */
export const axisCommon = {
    stroke: "#2A3550",
    tick: { fill: "#64748B", fontSize: 10, fontFamily: MONO },
    tickLine: { stroke: "#1B2335" },
};

/** Tooltip content style. */
export const tooltipStyle = {
    background: "#0A0F1C",
    border: "1px solid #2A3550",
    fontFamily: MONO,
    fontSize: 11,
    color: "#E6EAF2",
    borderRadius: 0,
};

export const gridStroke = "#141B2A";
