/**
 * DataSourceBadge — honest LIVE / MOCK / ERROR indicator for quant pages.
 * LIVE (green) = real Yahoo + backend calculation
 * MOCK (orange) = synthetic / demo data
 * ERROR (red) = backend unreachable or stale
 */
import React from "react";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { PALETTE } from "./primitives";

const STYLES = {
    live: {
        color: PALETTE.accent,
        label: "LIVE",
        Icon: Wifi,
    },
    mock: {
        color: PALETTE.warn,
        label: "MOCK",
        Icon: WifiOff,
    },
    error: {
        color: PALETTE.danger,
        label: "ERROR",
        Icon: AlertTriangle,
    },
};

export const DataSourceBadge = ({ source = "live", className = "" }) => {
    const cfg = STYLES[source] || STYLES.live;
    const Icon = cfg.Icon;
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.2em] border ${className}`}
            style={{
                color: cfg.color,
                borderColor: `${cfg.color}55`,
                background: `${cfg.color}12`,
            }}
            data-testid={`data-source-badge-${source}`}
        >
            <Icon size={10} />
            {cfg.label}
        </span>
    );
};

export default DataSourceBadge;
