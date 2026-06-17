import React from "react";
import { Info, AlertTriangle } from "lucide-react";

/**
 * Renders a natural-language interpretation block returned by the backend
 * (FNN summary or TDA narrative). Dark "quant terminal" styling.
 */
const InterpretationCard = ({ title = "Interpretation", text, warning }) => {
    if (!text && !warning) return null;
    return (
        <div className="border border-[#222222] bg-[#0F0F0F]">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#222222]">
                <Info size={12} strokeWidth={1.5} className="text-[#00E5C0]" />
                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-400">
                    {title}
                </span>
            </div>
            <div className="px-4 py-3 space-y-2">
                {text && (
                    <p className="text-[13px] leading-relaxed text-neutral-300 font-mono">
                        {text}
                    </p>
                )}
                {warning && (
                    <div className="flex items-start gap-2 mt-2 px-3 py-2 border border-[#FF9F1C]/40 bg-[#FF9F1C]/5">
                        <AlertTriangle
                            size={13}
                            strokeWidth={1.6}
                            className="text-[#FF9F1C] mt-0.5 shrink-0"
                        />
                        <p className="text-[12px] leading-relaxed text-[#FF9F1C] font-mono">
                            {warning}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InterpretationCard;
