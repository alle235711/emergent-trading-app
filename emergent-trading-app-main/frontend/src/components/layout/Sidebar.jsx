import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut, LogIn, PanelLeftClose, PanelLeftOpen, User } from "lucide-react";

import { NAV_SECTIONS } from "../../config/navigation";
import { useAuth } from "../../context/AuthContext";

/**
 * Fixed institutional sidebar (controlled).
 *
 *   • Brand mark with caret-blink
 *   • Sectioned navigation to all model rooms (driven by navigation.js)
 *   • Per-item LIVE / BETA / R&D status dot
 *   • Collapsible (icon-rail) mode — state owned by AppShell
 *   • Auth-aware footer (sign in / user + sign out)
 *
 * @param {{collapsed:boolean, onToggle:()=>void}} props
 */
const Sidebar = ({ collapsed = false, onToggle = () => {} }) => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    const handleSignOut = () => {
        signOut();
        navigate("/login", { replace: true });
    };

    const statusDot = (status) => {
        const c =
            status === "live" ? "#00E5C0"
            : status === "mock" ? "#FFB020"
            : status === "error" ? "#FF4D5E"
            : status === "beta" ? "#4F8BFF"
            : "#FFB020";
        return (
            <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: c }}
                title={status.toUpperCase()}
            />
        );
    };

    return (
        <aside
            data-testid="app-sidebar"
            className={[
                "fixed inset-y-0 left-0 z-40 flex flex-col",
                "bg-[#0A0F1C] border-r border-[#1B2335]",
                "transition-[width] duration-200 ease-out",
                collapsed ? "w-[68px]" : "w-[264px]",
            ].join(" ")}
        >
            {/* Brand */}
            <div className="h-16 flex items-center gap-3 px-5 border-b border-[#1B2335] shrink-0">
                <Link to="/" className="flex items-center gap-3 group min-w-0">
                    <span className="w-2.5 h-2.5 bg-[#00E5C0] caret-blink shrink-0" />
                    {!collapsed && (
                        <span className="text-sm font-mono tracking-[0.28em] uppercase text-slate-300 group-hover:text-white transition-colors truncate">
                            Quant<span className="text-[#00E5C0]">_</span>Desk
                        </span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav
                className="flex-1 overflow-y-auto py-4 px-3 space-y-6"
                aria-label="Primary"
            >
                {NAV_SECTIONS.map((section) => (
                    <div key={section.title}>
                        {!collapsed && (
                            <div className="px-2 mb-2 text-[9px] font-mono uppercase tracking-[0.3em] text-slate-600">
                                {section.title}
                            </div>
                        )}
                        <div className="space-y-0.5">
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <NavLink
                                        key={item.id}
                                        to={item.path}
                                        end={item.path === "/"}
                                        data-testid={`nav-${item.id}`}
                                        title={collapsed ? item.label : undefined}
                                        className={({ isActive }) =>
                                            [
                                                "group relative flex items-center gap-3 px-2.5 py-2 transition-colors duration-150",
                                                "border-l-2",
                                                isActive
                                                    ? "bg-[#00E5C0]/[0.06] border-[#00E5C0] text-white"
                                                    : "border-transparent text-slate-400 hover:text-white hover:bg-white/[0.03]",
                                            ].join(" ")
                                        }
                                    >
                                        <Icon size={16} strokeWidth={1.6} className="shrink-0" />
                                        {!collapsed && (
                                            <span className="flex-1 min-w-0">
                                                <span className="flex items-center gap-2">
                                                    <span className="text-[12px] font-medium truncate">
                                                        {item.label}
                                                    </span>
                                                    {item.badge && !collapsed && (
                                                        <span className="text-[8px] font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 border border-[#FFB020]/50 text-[#FFB020] shrink-0">
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                    {statusDot(item.status)}
                                                </span>
                                                <span className="block text-[10px] font-mono text-slate-600 truncate">
                                                    {item.short}
                                                </span>
                                            </span>
                                        )}
                                        {collapsed && (
                                            <span className="absolute top-1.5 right-1.5">
                                                {statusDot(item.status)}
                                            </span>
                                        )}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Footer: auth + collapse */}
            <div className="border-t border-[#1B2335] p-3 shrink-0 space-y-2">
                {user ? (
                    <div className={collapsed ? "flex flex-col items-center gap-2" : ""}>
                        {!collapsed && (
                            <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-mono text-slate-500">
                                <User size={12} strokeWidth={1.6} />
                                <span className="truncate max-w-[150px]">{user.email}</span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleSignOut}
                            data-testid="sidebar-signout"
                            className="w-full flex items-center justify-center gap-2 px-2 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 hover:text-[#FF4D5E] border border-[#1B2335] hover:border-[#FF4D5E]/40 transition-colors"
                        >
                            <LogOut size={13} strokeWidth={1.6} />
                            {!collapsed && "Sign out"}
                        </button>
                    </div>
                ) : (
                    <Link
                        to="/login"
                        data-testid="sidebar-signin"
                        className="w-full flex items-center justify-center gap-2 px-2 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#00E5C0] border border-[#00E5C0]/50 hover:bg-[#00E5C0] hover:text-black transition-colors"
                    >
                        <LogIn size={13} strokeWidth={1.6} />
                        {!collapsed && "Sign in"}
                    </Link>
                )}

                <button
                    type="button"
                    onClick={onToggle}
                    data-testid="sidebar-collapse"
                    className="w-full flex items-center justify-center gap-2 px-2 py-2 text-slate-500 hover:text-white transition-colors"
                    title={collapsed ? "Expand" : "Collapse"}
                >
                    {collapsed ? (
                        <PanelLeftOpen size={15} strokeWidth={1.6} />
                    ) : (
                        <>
                            <PanelLeftClose size={15} strokeWidth={1.6} />
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
                                Collapse
                            </span>
                        </>
                    )}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
