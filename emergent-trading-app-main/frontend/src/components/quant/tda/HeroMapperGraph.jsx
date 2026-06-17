import React, { useMemo } from "react";
import MapperGraph from "./MapperGraph";
import { buildMockMapper } from "../../../lib/tdaMock";

/**
 * Ambient, decorative Mapper graph for the landing/hero section.
 * - Floats slowly in the background.
 * - Color = local volatility.
 * - No interactivity, no UI chrome.
 */
const HeroMapperGraph = ({ height = 520, opacity = 0.55 }) => {
    const data = useMemo(() => buildMockMapper(13).data.graph, []);
    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ opacity }}
            aria-hidden="true"
        >
            <MapperGraph
                graphData={data}
                colorRange={[0, 1]}
                height={height}
                ambient
            />
        </div>
    );
};

export default HeroMapperGraph;
