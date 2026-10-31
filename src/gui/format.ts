export function clamp(value: number | undefined, min = 0, max = 100) {
  if (typeof value !== "number" || !Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function tone(percent: number) {
  if (percent >= 90) return "#ef4444"
  if (percent >= 70) return "#f59e0b"
  return "#22c55e"
}

export function formatPercent(value: number | undefined) {
  return `${clamp(value).toFixed(0)}%`
}

export function formatCompact(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0"
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function formatNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0"
  return new Intl.NumberFormat("zh-CN").format(value)
}

export function formatTokens(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0"
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export function formatMoney(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  if (value === 0) return "$0.00"
  if (value < 0.01) return `$${value.toFixed(4)}`
  if (value < 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

export function formatClock(timestamp: number | undefined) {
  if (!timestamp) return "未知"
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function formatDateTime(timestamp: number | undefined) {
  if (!timestamp) return "未知"
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  if (minutes >= 1_440) {
    const days = Math.floor(minutes / 1_440)
    const hours = Math.floor((minutes % 1_440) / 60)
    return `${days} 天 ${hours} 小时`
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours} 小时 ${minutes % 60} 分钟`
  }
  return `${minutes} 分钟`
}

export function formatReset(timestamp: number | undefined) {
  if (!timestamp) return "未知时间"
  const diff = timestamp - Date.now()
  const absolute = formatDateTime(timestamp)
  if (diff <= 0) return absolute
  return `${absolute}（${formatDuration(diff)}后）`
}

export function formatCountdown(timestamp: number | undefined) {
  if (!timestamp) return "—"
  const diff = timestamp - Date.now()
  if (diff <= 0) return "即将重置"
  return formatDuration(diff)
}

export function dayStart(offset = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date.getTime()
}

export function dayKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function dayLabel(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function sumTokens(tokens: {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

export function change(current: number, previous: number | undefined) {
  if (previous === undefined || previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

export function timezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
