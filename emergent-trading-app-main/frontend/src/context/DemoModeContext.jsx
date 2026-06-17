import React, { createContext, useContext, useMemo, useState } from "react";

const DemoModeContext = createContext(null);

const STORAGE_KEY = "quant_desk_demo_mode";

export const DemoModeProvider = ({ children }) => {
    const [demoMode, setDemoMode] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });

    const toggleDemoMode = () => {
        setDemoMode((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const value = useMemo(
        () => ({ demoMode, toggleDemoMode, setDemoMode }),
        [demoMode],
    );

    return (
        <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>
    );
};

export const useDemoMode = () => {
    const ctx = useContext(DemoModeContext);
    if (!ctx) {
        throw new Error("useDemoMode must be used inside <DemoModeProvider>");
    }
    return ctx;
};

export default DemoModeContext;
