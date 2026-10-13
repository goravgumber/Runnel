export function num(n) {
  // Never shows scientific notation. Always readable.
  if (n === null || n === undefined || isNaN(n)) return "—"
  const v = Math.round(n)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M"
  if (v >= 10_000)    return (v / 1_000).toFixed(0) + "K"
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + "K"
  return v.toLocaleString()
}

export function pct(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return "—"
  return (n * 100).toFixed(decimals) + "%"
}

export function ms(n) {
  if (!n && n !== 0) return "—"
  return Math.round(n) + "ms"
}

export function duration(ms) {
  if (!ms) return "—"
  const s = Math.floor(ms / 1000)
  if (s < 60) return s + "s"
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s"
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m"
}

export function date(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  })
}

export function time(d) {
  if (!d) return "—"
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit"
  })
}

export function datetime(d) {
  if (!d) return "—"
  return date(d) + " at " + time(d)
}

export function relativeTime(d) {
  if (!d) return "—"
  const diff = Date.now() - new Date(d).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  if (s < 86400) return Math.floor(s / 3600) + "h ago"
  return date(d)
}

export function delta(current, previous) {
  if (previous === undefined || previous === null) return null
  return current - previous
}

export function chartNum(value) {
  // For Recharts tickFormatter — short labels
  if (value >= 1000) return (value / 1000).toFixed(0) + "K"
  return Math.round(value)
}

export function tooltipNum(value) {
  // For Recharts tooltip — no decimals
  return Math.round(value).toLocaleString()
}

// Legacy aliases for compatibility
export const formatPop = num
export const formatDate = date
export const formatDuration = duration
