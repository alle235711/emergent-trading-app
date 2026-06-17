/**
 * ChartErrorBoundary — isolates Recharts failures so one chart cannot crash the page.
 */
import React from "react";
import { PALETTE } from "./primitives";

export class ChartErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, message: error?.message || "Chart render failed" };
    }

    componentDidUpdate(prevProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, message: null });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="flex flex-col items-center justify-center border border-[#1B2335] bg-[#0A0F1C] text-center px-4"
                    style={{ minHeight: this.props.minHeight ?? 200 }}
                    data-testid={this.props.testId || "chart-error-fallback"}
                >
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                        Chart unavailable
                    </p>
                    <p className="text-[11px] font-mono" style={{ color: PALETTE.warn }}>
                        {this.state.message}
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * SafeChart — wraps children in ChartErrorBoundary + optional mount deferral.
 */
export const SafeChart = ({
    ready = true,
    resetKey,
    minHeight = 200,
    testId,
    skeleton,
    children,
}) => {
    if (!ready) {
        return skeleton ?? (
            <div
                className="w-full bg-[#0E1422] animate-pulse"
                style={{ minHeight }}
            />
        );
    }
    return (
        <ChartErrorBoundary resetKey={resetKey} minHeight={minHeight} testId={testId}>
            {children}
        </ChartErrorBoundary>
    );
};

export default ChartErrorBoundary;
