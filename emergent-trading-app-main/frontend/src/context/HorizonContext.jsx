import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { computeScaledProfile, HORIZON_PROFILES } from "../lib/horizon";

/**
 * HorizonContext — the GLOBAL investment-horizon regime.
 * --------------------------------------------------------------------------
 * State model
 *   horizon        — active regime id ("short" | "medium" | "long")
 *   changeToken    — bumps on every setHorizon() call; used by AnalystGuide
 *
 *   pendingRanges  — day values currently shown in the sliders (not yet applied)
 *   customRanges   — day values that generators actually use (committed)
 *   rangeToken     — bumps every time commitRanges() is called; pages add this
 *                    to their useMemo deps so charts re-render on "Applica"
 *   profile        — scaled profile for the active horizon using customRanges
 *
 * Both `customRanges` and `pendingRanges` are persisted to localStorage.
 */

const HorizonContext = createContext(null);

const STORAGE_HORIZON  = "quantdesk.horizon";
const STORAGE_RANGES   = "quantdesk.horizon.ranges";

// ── localStorage helpers ─────────────────────────────────────────────────────

const readHorizon = () => {
    try {
        const raw = localStorage.getItem(STORAGE_HORIZON);
        return raw && HORIZON_PROFILES[raw] ? raw : "medium";
    } catch {
        return "medium";
    }
};

const defaultRanges = () =>
    Object.fromEntries(
        Object.keys(HORIZON_PROFILES).map((id) => [
            id,
            HORIZON_PROFILES[id].rangeDefault,
        ]),
    );

const readRanges = () => {
    try {
        const raw = localStorage.getItem(STORAGE_RANGES);
        if (raw) {
            const parsed = JSON.parse(raw);
            return Object.fromEntries(
                Object.keys(HORIZON_PROFILES).map((id) => {
                    const p = HORIZON_PROFILES[id];
                    const v = parsed[id];
                    const days =
                        typeof v === "number" && v >= p.rangeMin && v <= p.rangeMax
                            ? v
                            : p.rangeDefault;
                    return [id, days];
                }),
            );
        }
    } catch { /* ignore */ }
    return defaultRanges();
};

// ── Provider ─────────────────────────────────────────────────────────────────

export const HorizonProvider = ({ children }) => {
    const [horizon, setHorizonState] = useState(readHorizon);

    // committed ranges — what generators actually use
    const [customRanges, setCustomRangesState] = useState(readRanges);
    // pending ranges — what sliders currently show (not yet confirmed)
    const [pendingRanges, setPendingRangesState] = useState(() => ({ ...readRanges() }));

    // changeToken — bumps on horizon switch (used by AnalystGuide)
    const [changeToken, setChangeToken] = useState(0);
    // rangeToken — bumps on commitRanges() (used by all page useMemos)
    const [rangeToken, setRangeToken] = useState(0);

    // Persist committed ranges
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_RANGES, JSON.stringify(customRanges));
        } catch { /* quota / private mode — ignore */ }
    }, [customRanges]);

    // Persist active horizon
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_HORIZON, horizon);
        } catch { /* quota / private mode — ignore */ }
    }, [horizon]);

    const setHorizon = useCallback((next) => {
        if (!HORIZON_PROFILES[next]) return;
        setHorizonState(next);
        setChangeToken((t) => t + 1);
    }, []);

    /** Update a single pending slider value (not committed yet). */
    const setPendingRange = useCallback((id, days) => {
        if (!HORIZON_PROFILES[id]) return;
        const p = HORIZON_PROFILES[id];
        const clamped = Math.max(p.rangeMin, Math.min(p.rangeMax, Math.round(days)));
        setPendingRangesState((prev) => ({ ...prev, [id]: clamped }));
    }, []);

    /**
     * Commit all pending ranges → customRanges and bump rangeToken so every
     * page re-generates its chart data with the new observation window.
     */
    const commitRanges = useCallback(() => {
        setPendingRangesState((pending) => {
            setCustomRangesState({ ...pending });
            return pending;
        });
        setRangeToken((t) => t + 1);
    }, []);

    /** True when any pending value differs from the committed value. */
    const hasPendingChanges = useMemo(
        () =>
            Object.keys(HORIZON_PROFILES).some(
                (id) => pendingRanges[id] !== customRanges[id],
            ),
        [pendingRanges, customRanges],
    );

    const value = useMemo(
        () => ({
            horizon,
            setHorizon,
            changeToken,
            // Scaled profile — steps & bars adjusted to the committed day count
            profile: computeScaledProfile(horizon, customRanges[horizon]),
            // Range state
            customRanges,
            pendingRanges,
            setPendingRange,
            commitRanges,
            hasPendingChanges,
            rangeToken,
        }),
        [
            horizon,
            setHorizon,
            changeToken,
            customRanges,
            pendingRanges,
            setPendingRange,
            commitRanges,
            hasPendingChanges,
            rangeToken,
        ],
    );

    return (
        <HorizonContext.Provider value={value}>
            {children}
        </HorizonContext.Provider>
    );
};

export const useHorizon = () => {
    const ctx = useContext(HorizonContext);
    if (!ctx) {
        throw new Error("useHorizon must be used inside <HorizonProvider>");
    }
    return ctx;
};
