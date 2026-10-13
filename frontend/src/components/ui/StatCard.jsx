import React from "react";

export default function StatCard({
  title,
  value,
  icon: Icon,
  subtext,
  badge,
  badgeVariant = "neutral",
  onClick,
  className = "",
}) {
  const badgeColors = {
    neutral: "bg-canvas-well text-charcoal-secondary border-stone-border",
    success: "bg-[rgba(47,125,90,0.08)] text-[#2F7D5A] border-[rgba(47,125,90,0.25)]",
    warning: "bg-[rgba(183,121,31,0.08)] text-[#B7791F] border-[rgba(183,121,31,0.25)]",
    danger: "bg-[rgba(182,59,50,0.08)] text-[#B63B32] border-[rgba(182,59,50,0.25)]",
    info: "bg-[rgba(59,93,128,0.08)] text-[#3B5D80] border-[rgba(59,93,128,0.25)]",
  };

  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-stone-border rounded-xl p-5 shadow-card transition-all duration-150 ${
        onClick ? "cursor-pointer hover:border-stone-strong hover:shadow-elevated" : ""
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-charcoal-muted">
          {title}
        </span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-canvas-well border border-stone-border flex items-center justify-center text-charcoal-secondary shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl font-bold font-mono text-charcoal tabular-nums tracking-tight">
          {value ?? 0}
        </div>
        {badge && (
          <span
            className={`text-2xs font-mono font-medium px-2 py-0.5 rounded-full border ${
              badgeColors[badgeVariant] || badgeColors.neutral
            }`}
          >
            {badge}
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-2 text-xs text-charcoal-secondary truncate">{subtext}</p>
      )}
    </div>
  );
}
