import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  Settings,
  Plus,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { executionsAPI } from "../services/executionsAPI";
import Button from "./ui/Button";

const navigationItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/executions", label: "Execution Inbox", icon: Inbox },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const [connected, setConnected] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState({ failed: 0, retrying: 0 });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => setConnected(true);
    const handleOffline = () => setConnected(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Poll execution stats for live recovery alert badge
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
    const interval = setInterval(fetchBadgeStats, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const recoveryAlertCount = (stats.failed || 0) + (stats.retrying || 0);

  return (
    <div className="flex flex-col md:flex-row h-screen max-h-screen overflow-hidden bg-canvas font-sans text-charcoal">
      {/* Mobile Top Header (< md) */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-stone-border shrink-0 z-30">
        <div className="flex items-center gap-2">
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
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMobileMenuOpen(false); navigate("/executions?new=true"); }}
            className="p-1.5 rounded-lg bg-forest text-white"
            title="New Execution"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg border border-stone-border text-charcoal-secondary hover:text-charcoal bg-canvas-subtle"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-charcoal/30 backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Desktop anchored & Mobile Slide-over) */}
      <aside
        className={`
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          fixed md:static inset-y-0 left-0 w-[230px] shrink-0 h-full max-h-screen bg-surface border-r border-stone-border flex flex-col z-40 shadow-sm md:shadow-none select-none transition-transform duration-200 ease-in-out
        `}
      >
        {/* Brand Header */}
        <div className="px-5 pt-6 pb-4 border-b border-stone-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-forest flex items-center justify-center text-white font-bold font-mono text-sm shadow-sm">
              R
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-charcoal font-sans">
                RUNNEL
              </h1>
              <p className="text-charcoal-muted text-[10px] font-mono tracking-tight uppercase">
                Recovery Inbox
              </p>
            </div>
          </div>
        </div>

        {/* Quick Submit Action Button */}
        <div className="px-4 py-3 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setMobileMenuOpen(false); navigate("/executions?new=true"); }}
            className="w-full text-xs"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Execution
          </Button>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 min-h-0 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-charcoal-muted px-2 py-1">
            Navigation
          </div>

          {navigationItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-forest-ghost text-forest font-semibold"
                    : "text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well"
                }`
              }
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </div>

              {to === "/executions" && recoveryAlertCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-terracotta-ghost text-terracotta border border-terracotta-border">
                  {recoveryAlertCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer: User profile, connectivity & logout */}
        <div className="p-4 border-t border-stone-border space-y-3 bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <span className={`relative flex h-2 w-2 ${connected ? "" : "opacity-50"}`}>
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connected ? "animate-ping bg-[#2F7D5A]" : ""
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  connected ? "bg-[#2F7D5A]" : "bg-terracotta"
                }`}
              />
            </span>
            <span
              className={`text-2xs font-mono font-medium ${
                connected ? "text-charcoal-secondary" : "text-terracotta"
              }`}
            >
              {connected ? "Gateway Online" : "Connection Offline"}
            </span>
          </div>

          {user && (
            <div className="flex items-center gap-2.5 p-1 rounded-lg bg-canvas-well/60 border border-stone-border/60">
              <div className="w-6 h-6 rounded-md bg-forest/10 text-forest font-mono font-bold text-xs flex items-center justify-center shrink-0">
                {user.username?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-charcoal truncate font-mono">
                  {user.username}
                </p>
                <p className="text-[10px] text-charcoal-muted font-mono uppercase">
                  {user.role || "Developer"}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg text-charcoal-secondary hover:text-terracotta hover:bg-terracotta-ghost transition-colors cursor-pointer border border-transparent hover:border-terracotta-border"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
