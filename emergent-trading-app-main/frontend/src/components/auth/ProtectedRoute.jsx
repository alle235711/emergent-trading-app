import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

/**
 * Gate a subtree behind the mocked auth. Renders nothing during the very
 * first tick (while we hydrate the session from localStorage) to avoid a
 * brief unauthenticated flash on protected routes.
 */
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, bootstrapped } = useAuth();
    const location = useLocation();

    if (!bootstrapped) {
        return (
            <div
                className="min-h-screen bg-[#050505] flex items-center justify-center"
                data-testid="auth-bootstrap"
            >
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500 animate-term-pulse">
                    Initializing session<span className="caret-blink">_</span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname + location.search }}
            />
        );
    }

    return children;
};

export default ProtectedRoute;
