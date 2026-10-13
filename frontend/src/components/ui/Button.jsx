import React from "react";

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon = null,
  children,
  onClick,
  className = "",
  type = "button",
  ...props
}) {
  const base =
    "font-medium rounded-lg transition-all duration-150 cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

  const variants = {
    primary:
      "bg-forest text-white hover:bg-forest-hover active:scale-[0.98] shadow-sm font-semibold",
    secondary:
      "bg-surface text-charcoal border border-stone-border hover:bg-surface-hover hover:border-stone-strong active:scale-[0.98] shadow-sm",
    danger:
      "bg-terracotta text-white hover:bg-terracotta-hover active:scale-[0.98] shadow-sm font-semibold",
    "danger-outline":
      "bg-surface border border-terracotta/40 text-terracotta hover:bg-terracotta-ghost active:scale-[0.98]",
    ghost:
      "bg-transparent text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well",
    subtle:
      "bg-canvas-well text-charcoal hover:bg-canvas-high",
    outline:
      "bg-transparent border border-stone-border text-charcoal hover:bg-surface-hover hover:border-stone-strong",
  };

  const sizes = {
    xs: "px-2 py-1 text-xs",
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base font-semibold",
  };

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {!loading && icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
