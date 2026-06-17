import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { volatilityColor } from "../../../lib/tdaMock";

/**
 * Interactive force-directed graph for the Mapper algorithm output.
 *
 * Each node represents a market "cluster" (local regime).
 * Color   → local volatility (blue → red)
 * Size    → number of points in the cluster
 * Edges   → simplicial intersections between clusters
 *
 * Renders an on-hover tooltip with the cluster details (volatility range,
 * #points). Supports zoom / pan natively via react-force-graph.
 *
 * @param {Object}  props
 * @param {Object}  props.graphData    {nodes:[{id,size,color,pts}],edges:[{source,target}]}
 * @param {Array}   props.colorRange   [min, max] for tooltip range label
 * @param {number}  props.height       Optional fixed height
 * @param {boolean} props.ambient      If true, slow background animation
 *                                     with reduced UI (for hero section).
 */
const MapperGraph = ({
    graphData,
    colorRange = [0, 1],
    height = 420,
    ambient = false,
}) => {
    const containerRef = useRef(null);
    const fgRef = useRef(null);
    const [size, setSize] = useState({ w: 800, h: height });
    const [hovered, setHovered] = useState(null);
    const [mouse, setMouse] = useState({ x: 0, y: 0 });

    // Resize observer for responsiveness
    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const ro = new ResizeObserver(() => {
            const rect = el.getBoundingClientRect();
            setSize({ w: Math.max(200, rect.width), h: Math.max(200, rect.height) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Pre-process graphData: react-force-graph mutates the input,
    // so we clone and ensure id/links keys exist.
    const processedData = useMemo(() => {
        if (!graphData || !graphData.nodes) return { nodes: [], links: [] };
        return {
            nodes: graphData.nodes.map((n) => ({ ...n })),
            links: (graphData.edges || []).map((e) => ({
                source: e.source,
                target: e.target,
            })),
        };
    }, [graphData]);

    const handleNodeHover = useCallback((node) => {
        setHovered(node || null);
        if (containerRef.current) {
            containerRef.current.style.cursor = node ? "pointer" : "grab";
        }
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, []);

    const drawNode = useCallback(
        (node, ctx) => {
            const radius = Math.max(3, Math.sqrt(node.size || 4) * 1.4);
            const fill = volatilityColor(node.color);
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = fill;
            ctx.shadowColor = fill;
            ctx.shadowBlur = ambient ? 18 : 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Ring on hover
            if (hovered && node.id === hovered.id) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI, false);
                ctx.strokeStyle = "#FFFFFF";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        },
        [hovered, ambient]
    );

    // Tweak forces for a more pleasant layout
    useEffect(() => {
        if (!fgRef.current) return;
        const fg = fgRef.current;
        if (fg.d3Force) {
            const linkForce = fg.d3Force("link");
            if (linkForce) linkForce.distance(ambient ? 90 : 60).strength(0.5);
            const chargeForce = fg.d3Force("charge");
            if (chargeForce) chargeForce.strength(ambient ? -80 : -150);
        }
    }, [processedData, ambient]);

    const [cMin, cMax] = colorRange || [0, 1];

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className="relative w-full overflow-hidden bg-[#050505]"
            style={{ height }}
            data-testid="mapper-graph-container"
        >
            <ForceGraph2D
                ref={fgRef}
                graphData={processedData}
                width={size.w}
                height={size.h}
                backgroundColor="#050505"
                nodeCanvasObject={drawNode}
                nodePointerAreaPaint={(node, color, ctx) => {
                    const radius = Math.max(6, Math.sqrt(node.size || 4) * 1.6);
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                    ctx.fillStyle = color;
                    ctx.fill();
                }}
                linkColor={() => (ambient ? "rgba(0,229,192,0.15)" : "rgba(120,120,120,0.35)")}
                linkWidth={ambient ? 0.6 : 0.9}
                linkDirectionalParticles={ambient ? 0 : 1}
                linkDirectionalParticleSpeed={0.004}
                linkDirectionalParticleColor={() => "#00E5C0"}
                linkDirectionalParticleWidth={1.2}
                onNodeHover={ambient ? undefined : handleNodeHover}
                onNodeClick={
                    ambient
                        ? undefined
                        : (node) => {
                              if (fgRef.current) {
                                  fgRef.current.centerAt(node.x, node.y, 600);
                                  fgRef.current.zoom(3, 600);
                              }
                          }
                }
                enableNodeDrag={!ambient}
                enableZoomInteraction={!ambient}
                enablePanInteraction={!ambient}
                cooldownTicks={ambient ? Infinity : 200}
                d3VelocityDecay={ambient ? 0.25 : 0.35}
                d3AlphaDecay={ambient ? 0 : 0.025}
            />

            {/* Color-scale legend */}
            {!ambient && (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1.5 border border-[#222] bg-[#0F0F0F]/90">
                    <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-neutral-500">
                        σ local
                    </span>
                    <div
                        className="w-24 h-2 rounded-sm"
                        style={{
                            background:
                                "linear-gradient(90deg, rgb(37,99,235) 0%, rgb(6,182,212) 40%, rgb(234,179,8) 70%, rgb(239,68,68) 100%)",
                        }}
                    />
                    <span className="text-[9px] font-mono text-neutral-600">
                        {Number(cMin).toFixed(2)} → {Number(cMax).toFixed(2)}
                    </span>
                </div>
            )}

            {/* Tooltip on hover */}
            {!ambient && hovered && (
                <div
                    className="pointer-events-none absolute z-10 px-3 py-2 border border-[#00E5C0]/60 bg-[#0F0F0F]/95 shadow-lg"
                    style={{
                        left: Math.min(mouse.x + 14, size.w - 200),
                        top: Math.min(mouse.y + 14, size.h - 100),
                    }}
                >
                    <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#00E5C0] mb-1">
                        cluster {hovered.id}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-300 space-y-0.5">
                        <div>
                            <span className="text-neutral-500">data‑points:</span>{" "}
                            <span className="text-white">{hovered.size}</span>
                        </div>
                        <div>
                            <span className="text-neutral-500">vol norm:</span>{" "}
                            <span
                                className="font-semibold"
                                style={{ color: volatilityColor(hovered.color) }}
                            >
                                {Number(hovered.color).toFixed(3)}
                            </span>
                        </div>
                        <div className="text-[10px] text-neutral-500">
                            range {Number(cMin).toFixed(2)} – {Number(cMax).toFixed(2)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapperGraph;
