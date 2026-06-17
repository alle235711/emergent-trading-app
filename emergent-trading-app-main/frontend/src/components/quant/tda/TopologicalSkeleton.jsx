import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Loading skeleton displayed while heavy TDA computations run.
 * Dark terminal style matching the rest of the app.
 */
const TopologicalSkeleton = ({ stage = "Computing topological metrics" }) => {
    return (
        <div className="space-y-6">
            <div className="border border-[#222222] bg-[#0F0F0F] p-8 flex flex-col items-center justify-center gap-4">
                <Loader2
                    size={28}
                    strokeWidth={1.5}
                    className="text-[#00E5C0] animate-spin"
                />
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-400">
                    {stage}_
                </div>
                <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <span
                            key={i}
                            className="w-1.5 h-1.5 bg-[#00E5C0]/40 animate-pulse"
                            style={{ animationDelay: `${i * 0.12}s` }}
                        />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SkeletonBlock height="260px" />
                <SkeletonBlock height="260px" />
            </div>
            <SkeletonBlock height="420px" />
        </div>
    );
};

const SkeletonBlock = ({ height }) => (
    <div
        className="border border-[#222222] bg-[#0F0F0F] relative overflow-hidden"
        style={{ height }}
    >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00E5C0]/5 to-transparent animate-[shimmer_2s_infinite]" />
        <div className="absolute top-3 left-3 text-[9px] font-mono uppercase tracking-[0.3em] text-neutral-700">
            loading_
        </div>
    </div>
);

export default TopologicalSkeleton;
