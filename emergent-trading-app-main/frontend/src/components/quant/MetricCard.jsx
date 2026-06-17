import React from "react";

/**
 * Flat geometric metric tile - terminal/Bloomberg style.
 * No rounded corners, single 1px border, monospace data value.
 */
export const MetricCard = ({
    label,
    value,
    sub,
    tone = "neutral",
    loading = false,
    testId,
}) => {
    const toneClass =
        tone === "positive"
            ? "text-[#00E5C0]"
            : tone === "negative"
              ? "text-[#FF3B30]"
              : "text-white";

    return (
        <div
            data-testid={testId}
            className="border border-[#222222] bg-[#0F0F0F] p-5 sm:p-6 flex flex-col justify-between min-h-[140px] transition-all duration-150 ease-out hover:border-white/30"
        >
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                {label}
            </div>

            {loading ? (
                <div className="mt-4">
                    <div className="h-8 w-32 bg-[#1A1A1A] animate-term-pulse" />
                </div>
            ) : (
                <div className="mt-3 flex items-baseline gap-3">
                    <div
                        className={`text-3xl sm:text-4xl font-mono font-medium tracking-tight ${toneClass}`}
                    >
                        {value}
                    </div>
                </div>
            )}

            {sub ? (
                <div className="mt-2 text-[11px] font-mono text-neutral-500 tracking-wide">
                    {sub}
                </div>
            ) : null}
        </div>
    );
};

export default MetricCard;
