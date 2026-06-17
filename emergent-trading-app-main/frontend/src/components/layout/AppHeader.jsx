import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
    BarChart3,
    BrainCircuit,
    Briefcase,
    LogIn,
    LogOut,
    Settings,
    User,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import BrokerStatus from "./BrokerStatus";
import ModeToggle from "./ModeToggle";

/**
 * App-wide header.
 *
 *   • Brand mark with caret-blink
 *   • Primary nav: Markets / Portfolio
 *   • Broker API status pill (Disconnected by default)
 *   • Real ↔ Paper mode toggle
 *   • Auth-aware right rail (Sign in OR Settings + Sign out)
 */
const AppHeader = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    const handleSignOut = () => {
        signOut();
        navigate("/login", { replace: true });
    };

    return (
        <header className="border-b border-[#222222] bg-[#050505] sticky top-0 z-30">
            <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-4 flex items-center justify-between gap-6 flex-wrap">
                {/* Brand + primary nav */}
                <div className="flex items-center gap-8">
                    <Link
                        to="/"
                        className="flex items-center gap-3 group"
                        data-testid="brand-link"
                    >
                        <div className="w-2 h-2 bg-[#00E5C0] caret-blink" />
                        <div className="text-xs sm:text-sm font-mono tracking-[0.3em] uppercase text-neutral-400 group-hover:text-white transition-colors duration-150">
                            Quant
                            <span className="text-[#00E5C0]">_</span>Desk
                        </div>
                    </Link>

                    <nav
                        className="flex items-center gap-5"
                        data-testid="primary-nav"
                        aria-label="Primary"
                    >
                        <PrimaryLink
                            to="/"
                            label="Markets"
                            icon={<BarChart3 size={13} strokeWidth={1.6} />}
                            testId="nav-markets"
                            end
                        />
                        <PrimaryLink
                            to="/portfolio"
                            label="Portfolio"
                            icon={<Briefcase size={13} strokeWidth={1.6} />}
                            testId="nav-portfolio"
                        />
                        <PrimaryLink
                            to="/topological-analysis"
                            label="Topology"
                            icon={<BrainCircuit size={13} strokeWidth={1.6} />}
                            testId="nav-topology"
                        />
                    </nav>
                </div>

                {/* Right rail */}
                <div className="flex items-center gap-4 flex-wrap">
                    <BrokerStatus connected={false} />
                    <ModeToggle />

                    {user ? (
                        <div
                            className="flex items-center gap-4"
                            data-testid="header-user-cluster"
                        >
                            <NavLink
                                to="/settings"
                                data-testid="header-settings-link"
                                className={({ isActive }) =>
                                    [
                                        "flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em]",
                                        "transition-colors duration-150",
                                        isActive
                                            ? "text-[#00E5C0]"
                                            : "text-neutral-400 hover:text-white",
                                    ].join(" ")
                                }
                            >
                                <Settings size={14} strokeWidth={1.5} />
                                <span className="hidden sm:inline">Settings</span>
                            </NavLink>

                            <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500 border-l border-[#222222] pl-4">
                                <User size={12} strokeWidth={1.5} />
                                <span
                                    className="max-w-[160px] truncate"
                                    data-testid="header-user-email"
                                >
                                    {user.email}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={handleSignOut}
                                data-testid="header-signout-btn"
                                className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-400 hover:text-[#FF3B30] transition-colors duration-150"
                            >
                                <LogOut size={14} strokeWidth={1.5} />
                                <span className="hidden sm:inline">Sign out</span>
                            </button>
                        </div>
                    ) : (
                        <Link
                            to="/login"
                            data-testid="header-signin-link"
                            className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] px-3 py-2 border border-[#00E5C0] text-[#00E5C0] hover:bg-[#00E5C0] hover:text-black transition-colors duration-150"
                        >
                            <LogIn size={14} strokeWidth={1.5} />
                            <span>Sign in</span>
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
};

const PrimaryLink = ({ to, label, icon, testId, end = false }) => (
    <NavLink
        to={to}
        end={end}
        data-testid={testId}
        className={({ isActive }) =>
            [
                "flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.25em] py-1.5 border-b",
                "transition-colors duration-150",
                isActive
                    ? "text-[#00E5C0] border-[#00E5C0]"
                    : "text-neutral-400 border-transparent hover:text-white",
            ].join(" ")
        }
    >
        {icon}
        <span>{label}</span>
    </NavLink>
);

export default AppHeader;
