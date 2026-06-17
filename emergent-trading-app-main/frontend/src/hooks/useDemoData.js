import { useEffect, useState } from "react";
import { useDemoMode } from "../context/DemoModeContext";

/**
 * Load synthetic demo data only when Demo Mode is enabled.
 * @param {() => Promise<unknown>} loader dynamic import + builder
 * @param {unknown[]} deps
 */
export function useDemoData(loader, deps = []) {
    const { demoMode } = useDemoMode();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!demoMode) {
            setData(null);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        loader()
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch(() => {
                if (!cancelled) setData(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [demoMode, ...deps]);

    const dataSource = demoMode ? (data ? "mock" : loading ? "mock" : "error") : "error";
    return { data, dataSource, demoMode, loading };
}

export default useDemoData;
