export default function Badge({ variant = "neutral", _size = "sm", dot = false, children, className = "" }) {
  const variants = {
    ok: "text-ok bg-ok-bg border-ok-edge",
    warn: "text-warn bg-warn-bg border-warn-edge", 
    danger: "text-danger bg-danger-bg border-danger-edge",
    info: "text-cyan bg-info-bg border-info-edge",
    neutral: "text-mid bg-raised border-edge",
    running: "text-warn bg-warn-bg border-warn-edge",
  }

  const dotColors = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger", 
    info: "bg-cyan",
    neutral: "bg-mid",
    running: "bg-warn animate-pulse",
  }

  return (
    <span className={`text-2xs font-mono px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5 ${variants[variant] || variants.neutral} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || dotColors.neutral}`} />}
      {children}
    </span>
  )
}
