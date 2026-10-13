import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  Settings,
  Plus,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { executionsAPI } from "../services/executionsAPI";
import { healthAPI } from "../services/api";

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("runnel_sidebar_collapsed") === "true";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState({ failed: 0 });
  const [healthState, setHealthState] = useState({
    status: "checking", // "healthy" | "degraded" | "unavailable" | "checking"
    label: "Checking gateway...",
    detail: "",
  });

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Persist collapsed state
  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("runnel_sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  // Poll execution stats for live failure count beside Executions
  useEffect(() => {
    let isMounted = true;
    const fetchBadgeStats = async () => {
      try {
        const { data } = await executionsAPI.stats();
        if (isMounted && data) {
          setStats(data);
        }
      } catch (_err) {
        // Ignore background badge stats poll error
      }
    };

    fetchBadgeStats();
    const interval = setInterval(fetchBadgeStats, 12000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Poll real backend health status from /health
  const checkHealth = useCallback(async () => {
    try {
      const { data, error } = await healthAPI.all();
      if (error || !data) {
        setHealthState({
          status: "unavailable",
          label: "Gateway Unavailable",
          detail: error || "API service unreachable",
        });
        return;
      }

      const status = data?.data?.status || data?.status;
      const mongo = data?.data?.services?.mongodb?.status || data?.services?.mongodb?.status;
      const redis = data?.data?.services?.redis?.status || data?.services?.redis?.status;

      if (status === "pass" && mongo === "connected" && redis === "connected") {
        setHealthState({
          status: "healthy",
          label: "Gateway Online",
          detail: "MongoDB & Redis operational",
        });
      } else if (status === "warn" || mongo !== "connected" || redis !== "connected") {
        setHealthState({
          status: "degraded",
          label: "Service Degraded",
          detail: `Mongo: ${mongo}, Redis: ${redis}`,
        });
      } else {
        setHealthState({
          status: "healthy",
          label: "Gateway Online",
          detail: "All services operational",
        });
      }
    } catch (_err) {
      setHealthState({
        status: "unavailable",
        label: "Gateway Unavailable",
        detail: "Failed to connect to backend",
      });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleNewExecution = () => {
    setMobileMenuOpen(false);
    navigate("/executions?new=true");
  };

  const failedCount = stats.failed || 0;

  // Active route helpers
  const isOverviewActive = location.pathname === "/";
  const isExecutionsActive = location.pathname.startsWith("/executions");
  const isSettingsActive = location.pathname.startsWith("/settings");

  // Keyboard shortcut (Ctrl+B / Cmd+B) for toggling desktop sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapse]);

  return (
    <div className="flex flex-col md:flex-row h-screen max-h-screen overflow-hidden bg-canvas font-sans text-charcoal">
      {/* ========================================================
          MOBILE TOP HEADER (< md)
         ======================================================== */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-stone-border shrink-0 z-20">
        <NavLink to="/" className="flex items-center gap-2.5 focus:outline-none">
          <div className="w-7 h-7 rounded-lg bg-forest flex items-center justify-center text-white font-bold font-mono text-xs shadow-sm">
            R
          </div>
          <div>
            <h1 className="font-bold text-xs tracking-wide text-charcoal font-sans">
              RUNNEL
            </h1>
            <p className="text-charcoal-muted text-[9px] font-mono tracking-tight uppercase">
              Recovery Inbox
            </p>
          </div>
        </NavLink>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNewExecution}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-forest text-white text-xs font-semibold shadow-sm hover:bg-forest-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest/40"
            title="New execution"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg border border-stone-border text-charcoal-secondary hover:text-charcoal bg-canvas-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest/40"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Backdrop */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-charcoal/40 backdrop-blur-xs transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ========================================================
          CANONICAL SIDEBAR (Desktop Fixed & Mobile Slide-Over Drawer)
         ======================================================== */}
      <aside
        id="canonical-sidebar"
        aria-label="Main Navigation"
        className={`
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          }
          fixed md:static inset-y-0 left-0 shrink-0 h-full max-h-screen bg-surface border-r border-stone-border flex flex-col z-40 select-none transition-all duration-200 ease-in-out
          ${collapsed ? "md:w-[68px]" : "md:w-[240px]"}
          w-[260px]
        `}
      >
        {/* Brand Header */}
        {collapsed ? (
          /* Collapsed State: Clean, fixed 68px icon rail */
          <div className="px-3 py-3.5 border-b border-stone-border/70 shrink-0 flex flex-col items-center gap-2.5">
            {/* Centered Logo Navigating to Overview */}
            <NavLink
              to="/"
              title="Runnel — Overview"
              aria-label="Runnel — Overview"
              className="w-9 h-9 rounded-xl bg-forest border border-forest-border flex items-center justify-center text-white shadow-sm hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 transition-all shrink-0 cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </NavLink>

            {/* Dedicated Expand Sidebar Control with clear hit target */}
            <button
              type="button"
              id="sidebar-collapse-toggle-btn"
              onClick={toggleCollapse}
              aria-label="Expand sidebar"
              aria-expanded={false}
              title="Expand sidebar (Ctrl+B)"
              className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg text-charcoal-secondary hover:text-forest bg-canvas-well/70 hover:bg-canvas-well border border-stone-border/70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 shrink-0"
            >
              <PanelLeft className="w-4 h-4 text-forest" />
            </button>
          </div>
        ) : (
          /* Expanded State: 240px sidebar with brand mark, subtitle and separate collapse control */
          <div className="px-4 py-4 border-b border-stone-border/70 shrink-0 flex items-center justify-between">
            <NavLink
              to="/"
              title="Runnel — Overview"
              aria-label="Runnel — Overview"
              className="flex items-center gap-2.5 min-w-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/30 rounded-lg"
            >
              {/* Runnel Rounded Node Icon */}
              <div className="w-8 h-8 rounded-xl bg-forest border border-forest-border flex items-center justify-center text-white shrink-0 shadow-sm group-hover:opacity-95 transition-opacity">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="font-bold text-sm tracking-tight text-charcoal font-sans block leading-none">
                  Runnel
                </span>
                <span className="text-charcoal-muted text-[10px] font-mono tracking-tight uppercase block mt-1">
                  Recovery Inbox
                </span>
              </div>
            </NavLink>

            {/* Desktop Collapse Toggle Button */}
            <button
              type="button"
              id="sidebar-collapse-toggle-btn"
              onClick={toggleCollapse}
              aria-label="Collapse sidebar"
              aria-expanded={true}
              title="Collapse sidebar (Ctrl+B)"
              className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well border border-stone-border/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/30 shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Primary Action: New Execution */}
        <div className="p-3 shrink-0">
          <button
            id="sidebar-new-execution-btn"
            type="button"
            onClick={handleNewExecution}
            title="New execution"
            aria-label="New execution"
            className={`
              flex items-center justify-center rounded-lg bg-forest hover:bg-forest-hover active:bg-[#122E21] text-white font-semibold text-xs transition-all shadow-sm cursor-pointer
              ${collapsed ? "w-10 h-10 mx-auto" : "w-full h-9 px-3 gap-2"}
            `}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">New execution</span>}
          </button>
        </div>

        {/* Navigation Sections */}
        <nav
          className="flex-1 min-h-0 px-3 py-2 space-y-4 overflow-y-auto"
          aria-label="Sidebar Sections"
        >
          {/* WORK Section */}
          <div>
            {!collapsed && (
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-charcoal-muted px-2.5 py-1 mb-1">
                Work
              </div>
            )}
            <div className="space-y-1">
              {/* Overview */}
              <NavLink
                to="/"
                end
                onClick={() => setMobileMenuOpen(false)}
                title={collapsed ? "Overview" : undefined}
                aria-label="Overview"
                aria-current={isOverviewActive ? "page" : undefined}
                className={`
                  flex items-center rounded-lg text-xs transition-all font-medium
                  ${
                    collapsed
                      ? "justify-center h-10 w-10 mx-auto"
                      : "justify-between px-3 py-2"
                  }
                  ${
                    isOverviewActive
                      ? "bg-forest-ghost text-forest font-semibold"
                      : "text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well"
                  }
                `}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">Overview</span>}
                </div>
              </NavLink>

              {/* Executions */}
              <NavLink
                to="/executions"
                onClick={() => setMobileMenuOpen(false)}
                title={
                  collapsed
                    ? `Executions${failedCount > 0 ? ` (${failedCount} failed)` : ""}`
                    : undefined
                }
                aria-label="Executions"
                aria-current={isExecutionsActive ? "page" : undefined}
                className={`
                  relative flex items-center rounded-lg text-xs transition-all font-medium
                  ${
                    collapsed
                      ? "justify-center h-10 w-10 mx-auto"
                      : "justify-between px-3 py-2"
                  }
                  ${
                    isExecutionsActive
                      ? "bg-forest-ghost text-forest font-semibold"
                      : "text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well"
                  }
                `}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Inbox className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">Executions</span>}
                </div>

                {/* Real Failure Count Badge */}
                {failedCount > 0 && (
                  collapsed ? (
                    <span
                      title={`${failedCount} failed executions`}
                      className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[9px] font-mono font-bold bg-terracotta text-white border border-surface shadow-xs"
                    >
                      {failedCount}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-terracotta-ghost text-terracotta border border-terracotta-border">
                      {failedCount}
                    </span>
                  )
                )}
              </NavLink>
            </div>
          </div>

          {/* PREFERENCES Section */}
          <div>
            {!collapsed && (
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-charcoal-muted px-2.5 py-1 mb-1">
                Preferences
              </div>
            )}
            <div className="space-y-1">
              {/* Settings */}
              <NavLink
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                title={collapsed ? "Settings" : undefined}
                aria-label="Settings"
                aria-current={isSettingsActive ? "page" : undefined}
                className={`
                  flex items-center rounded-lg text-xs transition-all font-medium
                  ${
                    collapsed
                      ? "justify-center h-10 w-10 mx-auto"
                      : "justify-between px-3 py-2"
                  }
                  ${
                    isSettingsActive
                      ? "bg-forest-ghost text-forest font-semibold"
                      : "text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well"
                  }
                `}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Settings className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">Settings</span>}
                </div>
              </NavLink>
            </div>
          </div>
        </nav>

        {/* Sidebar Footer: Service Status, User Profile & Sign Out */}
        <div className="p-3 border-t border-stone-border bg-surface shrink-0 space-y-2.5">
          {/* Real Service Health Status */}
          <div
            className={`flex items-center ${collapsed ? "justify-center" : "gap-2 px-1"}`}
            title={`${healthState.label}${healthState.detail ? ` (${healthState.detail})` : ""}`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {healthState.status === "healthy" && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-emerald-500" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  healthState.status === "healthy"
                    ? "bg-emerald-600"
                    : healthState.status === "degraded"
                    ? "bg-amber-500"
                    : "bg-terracotta"
                }`}
              />
            </span>
            {!collapsed && (
              <span
                className={`text-2xs font-mono font-medium truncate ${
                  healthState.status === "healthy"
                    ? "text-charcoal-secondary"
                    : healthState.status === "degraded"
                    ? "text-amber-700"
                    : "text-terracotta"
                }`}
              >
                {healthState.label}
              </span>
            )}
          </div>

          {/* User Account Info */}
          {user && (
            <div
              className={`
                flex items-center rounded-lg bg-canvas-well/60 border border-stone-border/60
                ${collapsed ? "justify-center p-1.5" : "p-1.5 gap-2.5"}
              `}
              title={`${user.username} (${user.role || "Developer"})`}
            >
              <div className="w-6 h-6 rounded-md bg-forest/15 text-forest font-mono font-bold text-xs flex items-center justify-center shrink-0">
                {user.username?.[0]?.toUpperCase() || "U"}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-charcoal truncate font-mono">
                    {user.username}
                  </p>
                  <p className="text-[10px] text-charcoal-muted font-mono uppercase truncate">
                    {user.role || "Developer"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sign Out Button */}
          <button
            type="button"
            id="sidebar-sign-out-btn"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className={`
              flex items-center text-xs font-medium rounded-lg text-charcoal-secondary hover:text-terracotta hover:bg-terracotta-ghost transition-colors cursor-pointer border border-transparent hover:border-terracotta-border
              ${collapsed ? "justify-center w-10 h-8 mx-auto" : "w-full justify-center gap-2 px-3 py-1.5"}
            `}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ========================================================
          MAIN INDEPENDENT SCROLL AREA
         ======================================================== */}
      <main className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto bg-canvas">
        <Outlet />
      </main>
    </div>
  );
}
