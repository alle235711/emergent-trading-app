import React from "react";
import { LineChart, Bitcoin, DollarSign, Building2 } from "lucide-react";

/**
 * Asset-class tab navigation.
 * Sharp-edged segmented bar matching the terminal aesthetic.
 */
export const AssetTabs = ({ value, onChange }) => {
    const tabs = [
        { key: "etf", label: "ETF / Equity", icon: LineChart },
        { key: "crypto", label: "Crypto", icon: Bitcoin },
        { key: "forex", label: "Forex", icon: DollarSign },
        { key: "stocks", label: "Stocks", icon: Building2 },
    ];

    return (
        <nav
            className="inline-flex flex-wrap border border-[#222222] bg-[#0F0F0F]"
            data-testid="asset-tabs"
            role="tablist"
            aria-label="Asset class"
        >
            {tabs.map((t) => {
                const Icon = t.icon;
                const active = t.key === value;
                return (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(t.key)}
                        data-testid={`asset-tab-${t.key}`}
                        className={[
                            "flex items-center gap-2 px-5 py-2.5 text-xs font-mono tracking-[0.2em] uppercase",
                            "border-r border-[#222222] last:border-r-0",
                            "transition-all duration-150 ease-out",
                            active
                                ? "text-[#00E5C0] bg-black"
                                : "text-neutral-500 hover:text-white",
                        ].join(" ")}
                    >
                        <Icon size={14} strokeWidth={1.6} />
                        <span>{t.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};

export default AssetTabs;
