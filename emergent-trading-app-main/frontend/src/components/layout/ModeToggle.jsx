import React from "react";

import { useTrading } from "../../context/TradingContext";

/**
 * Real / Paper toggle switch.
 * Sharp-edged sliding segmented control, themed by mode:
 *   • Real   → aqua accent
 *   • Paper  → amber accent (matches the broker-disconnected warning palette)
 */
const ModeToggle = () => {
    const { mode, setMode, isPaper } = useTrading();

    return (
        <div
            className="inline-flex border border-[#222222] bg-[#0F0F0F]"
            data-testid="mode-toggle"
            role="tablist"
            aria-label="Trading mode"
        >
            <button
                type="button"
                role="tab"
                aria-selected={mode === "real"}
                onClick={() => setMode("real")}
                data-testid="mode-toggle-real"
                className={[
                    "px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.25em] border-r border-[#222222] transition-colors duration-150",
                    mode === "real"
                        ? "text-[#00E5C0] bg-black"
                        : "text-neutral-500 hover:text-white",
                ].join(" ")}
            >
                Real
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={isPaper}
                onClick={() => setMode("paper")}
                data-testid="mode-toggle-paper"
                className={[
                    "px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.25em] transition-colors duration-150",
                    isPaper
                        ? "text-[#FFB020] bg-black"
                        : "text-neutral-500 hover:text-white",
                ].join(" ")}
            >
                Paper
            </button>
        </div>
    );
};

export default ModeToggle;
