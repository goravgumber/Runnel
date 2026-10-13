import { useEffect } from "react"

export default function Alert({ variant = "info", onClose, autoClose = false, children, className = "" }) {
  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(onClose, typeof autoClose === "number" ? autoClose : 6000)
      return () => clearTimeout(timer)
    }
  }, [autoClose, onClose])

  const variants = {
    info: "border-info/30 bg-info-bg text-hi",
    warning: "border-warn/30 bg-warn-bg text-warn",
    danger: "border-danger/30 bg-danger-bg text-danger",
    error: "border-danger/40 bg-danger-bg text-danger",
    success: "border-ok/30 bg-ok-bg text-ok",
  }

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 border rounded-md text-sm leading-relaxed animate-fade-in ${variants[variant] || variants.info} ${className}`}>
      <div className="flex-1 min-w-0">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
          aria-label="Close alert"
        >
          &times;
        </button>
      )}
    </div>
  )
}
