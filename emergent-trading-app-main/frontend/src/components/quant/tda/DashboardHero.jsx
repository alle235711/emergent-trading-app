import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BrainCircuit } from "lucide-react";

import HeroMapperGraph from "./HeroMapperGraph";

/**
 * Decorative hero block for the Dashboard landing area.
 * Showcases the TDA mapper algorithm as an animated background and CTA
 * to the dedicated /topological-analysis route.
 */
const DashboardHero = () => {
    return (
        <section
            className="relative overflow-hidden border border-[#222222] bg-[#0A0A0A] mb-10"
            data-testid="dashboard-hero"
        >
            {/* Animated mapper background */}
            <div className="absolute inset-0">
                <HeroMapperGraph height={360} opacity={0.7} />
            </div>

            {/* Gradient fade so text stays readable */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "linear-gradient(90deg, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.75) 45%, rgba(5,5,5,0.25) 100%)",
                }}
            />

            <div className="relative z-10 px-6 sm:px-10 py-12 sm:py-14 max-w-3xl">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-[#00E5C0]">
                    <BrainCircuit size={12} strokeWidth={1.6} />
                    <span>// new · topological data analysis</span>
                </div>
                <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl tracking-tight font-medium leading-tight">
                    See the{" "}
                    <span className="text-[#00E5C0]">hidden structure</span>{" "}
                    of the market.
                </h2>
                <p className="mt-4 text-sm text-neutral-400 max-w-xl leading-relaxed">
                    Mapper clusters &amp; persistent homology turn raw price action
                    into a navigable graph. Detect sparse regimes before volatility
                    blows up. Forecast GBM probability cones from the topology of
                    the recent past.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Link
                        to="/topological-analysis"
                        data-testid="hero-cta-topology"
                        className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] px-3.5 py-2 border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors duration-150"
                    >
                        <span>Open Topology Lab</span>
                        <ArrowUpRight size={13} strokeWidth={1.6} />
                    </Link>
                    <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-600">
                        Mapper · Vietoris–Rips · Cao / Kennel · GBM
                    </span>
                </div>
            </div>
        </section>
    );
};

export default DashboardHero;
