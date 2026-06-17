import { useEffect, useState } from "react";

/**
 * Defer Recharts mount until the DOM has settled after data / key changes.
 * Prevents React "insertBefore" / "removeChild" crashes when charts reconcile
 * while a parent is still unmounting (e.g. global horizon selector).
 */
export function useChartMountReady(deps) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        setReady(false);
        if (!deps) return undefined;

        let cancelled = false;
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!cancelled) setReady(true);
            });
        });

        return () => {
            cancelled = true;
            cancelAnimationFrame(id);
        };
    }, [deps]);

    return ready;
}
