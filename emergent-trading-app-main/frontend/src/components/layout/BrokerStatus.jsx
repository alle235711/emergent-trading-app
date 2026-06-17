import React from "react";

/**
 * Broker connection status pill.
 * For now hard-coded to "Disconnected" with a red dot — there is no live
 * broker integration. The dot becomes green when a real broker is wired in.
 */
const BrokerStatus = ({ connected = false }) => {
    const dot = connected ? "bg-[#00E5C0]" : "bg-[#FF3B30]";
    const label = connected ? "Connected" : "Disconnected";

    return (
        <div
            className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-[#222222] bg-[#0F0F0F]"
            data-testid="broker-api-status"
            aria-live="polite"
        >
            <span
                className={`relative inline-flex w-2 h-2 ${dot}`}
                aria-hidden="true"
            >
                {!connected ? (
                    <span className="absolute inset-0 bg-[#FF3B30]/50 animate-ping" />
                ) : null}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-400">
                Broker API
            </span>
            <span
                className={[
                    "text-[10px] font-mono uppercase tracking-[0.25em]",
                    connected ? "text-[#00E5C0]" : "text-[#FF3B30]",
                ].join(" ")}
                data-testid="broker-api-status-label"
            >
                {label}
            </span>
        </div>
    );
};

export default BrokerStatus;
