import { NavLink } from "react-router-dom";
import { LayoutDashboard, Inbox, Settings } from "lucide-react";

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/executions", label: "Execution Inbox", icon: Inbox },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <div className="h-full bg-surface border-r border-stone-border p-4 flex flex-col font-sans">
      <div className="mb-6 px-1">
        <h1 className="text-forest font-bold text-sm font-sans tracking-wide">RUNNEL</h1>
        <p className="text-charcoal-muted text-[10px] font-mono uppercase">Recovery Inbox</p>
      </div>
      <nav className="flex-1 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-forest-ghost text-forest font-semibold"
                  : "text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well"
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
