import React from "react";
import { CheckCircle2, Clock, Loader2, AlertTriangle, RotateCcw, Ban } from "lucide-react";

const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    badge: "bg-[rgba(47,125,90,0.08)] text-[#2F7D5A] border-[rgba(47,125,90,0.25)]",
    dot: "bg-[#2F7D5A]",
    icon: CheckCircle2,
  },
  running: {
    label: "Running",
    badge: "bg-[rgba(59,93,128,0.08)] text-[#3B5D80] border-[rgba(59,93,128,0.25)]",
    dot: "bg-[#3B5D80] animate-pulse",
    icon: Loader2,
  },
  pending: {
    label: "Pending",
    badge: "bg-[rgba(183,121,31,0.08)] text-[#B7791F] border-[rgba(183,121,31,0.25)]",
    dot: "bg-[#B7791F]",
    icon: Clock,
  },
  retrying: {
    label: "Retrying",
    badge: "bg-[rgba(183,121,31,0.08)] text-[#B7791F] border-[rgba(183,121,31,0.25)]",
    dot: "bg-[#B7791F] animate-pulse",
    icon: RotateCcw,
  },
  failed: {
    label: "Failed",
    badge: "bg-[rgba(182,59,50,0.08)] text-[#B63B32] border-[rgba(182,59,50,0.25)]",
    dot: "bg-[#B63B32]",
    icon: AlertTriangle,
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-[#F1F1ED] text-[#62625D] border-[#DCDCD5]",
    dot: "bg-[#85857E]",
    icon: Ban,
  },
};

export default function StatusBadge({ status, showIcon = false, size = "sm", className = "" }) {
  const normStatus = (status || "cancelled").toLowerCase();
  const config = STATUS_CONFIG[normStatus] || STATUS_CONFIG.cancelled;
  const Icon = config.icon;

  const sizeClasses = {
    xs: "px-2 py-0.5 text-[10px] gap-1",
    sm: "px-2.5 py-0.5 text-xs gap-1.5",
    md: "px-3 py-1 text-sm gap-2",
  };

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full font-mono uppercase tracking-wider select-none ${sizeClasses[size] || sizeClasses.sm} ${config.badge} ${className}`}
    >
      {showIcon ? (
        <Icon className={`w-3.5 h-3.5 shrink-0 ${normStatus === "running" ? "animate-spin" : ""}`} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      )}
      <span>{config.label}</span>
    </span>
  );
}
