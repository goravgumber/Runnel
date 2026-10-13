import React from "react";
import Button from "./Button";
import { Inbox } from "lucide-react";

export default function EmptyState({
  icon: Icon = Inbox,
  title = "No items found",
  description = "Get started by submitting a new background execution.",
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-12 text-center bg-surface border border-dashed border-stone-strong rounded-2xl ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-canvas-well border border-stone-border flex items-center justify-center text-charcoal-muted mb-4 shadow-sm">
        <Icon className="w-7 h-7 text-forest" />
      </div>

      <h3 className="text-base font-semibold text-charcoal mb-1">{title}</h3>
      <p className="text-sm text-charcoal-secondary max-w-sm mb-6 leading-relaxed">
        {description}
      </p>

      {(actionText || secondaryActionText) && (
        <div className="flex items-center gap-3">
          {secondaryActionText && (
            <Button variant="secondary" onClick={onSecondaryAction}>
              {secondaryActionText}
            </Button>
          )}
          {actionText && (
            <Button variant="primary" onClick={onAction}>
              {actionText}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
