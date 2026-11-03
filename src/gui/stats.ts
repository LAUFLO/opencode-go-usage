import { dayKey, dayStart, monthStart, timezone, weekStart } from "./format"
import type { SessionStats, StatsBundle, StatsDay, StatsTokens } from "./types"

type StatsInput = {
  from?: number
  to?: number
  project?: string
  timezone?: string
  tools?: "none" | "summary" | "detail"
}

type StatsClient = {
  experimental: {
    session: {
      stats(input?: StatsInput): Promise<unknown>
    }
  }
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    const candidate = record.epochMilliseconds ?? record.epochMillis ?? record.millis ?? record.seconds
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate < 1_000_000_000_000 ? candidate * 1_000 : candidate
    }
    const parsed = Date.parse(String(value))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readTokens(value: unknown): StatsTokens {
  const record = (value ?? {}) as Record<string, unknown>
  const cache = (record.cache ?? {}) as Record<string, unknown>
  return {
    input: num(record.input),
    output: num(record.output),
    reasoning: num(record.reasoning),
    cache: { read: num(cache.read), write: num(cache.write) },
  }
}

export function normalizeStats(value: unknown): SessionStats {
  const record = (value ?? {}) as Record<string, unknown>
  const range = (record.range ?? {}) as Record<string, unknown>
  const tools = (record.tools ?? {}) as Record<string, unknown>
  const totals = tools.totals as Record<string, unknown> | undefined
  const activity = Array.isArray(record.activity) ? record.activity : []
  const models = Array.isArray(record.models) ? record.models : []

  return {
    range: { from: toNumber(range.from), to: toNumber(range.to) },
    sessions: num(record.sessions),
    subagents: num(record.subagents),
    prompts: num(record.prompts),
    steps: num(record.steps),
    tokens: readTokens(record.tokens),
    cost: num(record.cost),
    tools: {
      mode: typeof tools.mode === "string" ? tools.mode : "none",
      totals: totals
        ? {
            calls: num(totals.calls),
            succeeded: num(totals.succeeded),
            failed: num(totals.failed),
            unfinished: num(totals.unfinished),
          }
        : undefined,
    },
    activeDays: num(record.activeDays),
    streak: num(record.streak),
    activity: activity.map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      return { date: String(entry.date ?? ""), steps: num(entry.steps) }
    }),
    models: models.map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      const model = (entry.model ?? {}) as Record<string, unknown>
      return {
        model: {
          id: String(model.id ?? ""),
          providerID: String(model.providerID ?? ""),
          variant: typeof model.variant === "string" ? model.variant : undefined,
        },
        steps: num(entry.steps),
        tokens: readTokens(entry.tokens),
        cost: num(entry.cost),
      }
    }),
  }
}

async function fetchStats(client: StatsClient, input: StatsInput) {
  return normalizeStats(await client.experimental.session.stats(input))
}

export async function loadStatsBundle(
  client: StatsClient,
  options: { project?: string; cache: Map<string, SessionStats> },
): Promise<StatsBundle> {
  const project = options.project
  const tz = timezone()
  const common = { project, timezone: tz }

  const [today, week, month] = await Promise.all([
    fetchStats(client, {
      ...common,
      from: dayStart(0),
      to: Date.now(),
      tools: "summary",
    }),
    fetchStats(client, {
      ...common,
      from: weekStart(),
      to: Date.now(),
      tools: "summary",
    }),
    fetchStats(client, {
      ...common,
      from: monthStart(),
      to: Date.now(),
      tools: "summary",
    }),
  ])

  const missing: { date: string; from: number; to: number }[] = []
  const days: StatsDay[] = []

  for (let offset = -6; offset <= -1; offset += 1) {
    const from = dayStart(offset)
    const date = dayKey(from)
    const cached = options.cache.get(date)
    if (cached) {
      days.push({ date, stats: cached })
      continue
    }
    missing.push({ date, from, to: dayStart(offset + 1) })
  }

  const fetched = await Promise.all(
    missing.map(async (item) => ({
      date: item.date,
      stats: await fetchStats(client, {
        ...common,
        from: item.from,
        to: item.to,
        tools: "none",
      }),
    })),
  )

  for (const item of fetched) {
    options.cache.set(item.date, item.stats)
    days.push(item)
  }

  days.push({ date: dayKey(dayStart(0)), stats: today })
  days.sort((a, b) => a.date.localeCompare(b.date))

  return {
    today,
    yesterday: days.find((item) => item.date === dayKey(dayStart(-1)))?.stats,
    week,
    month,
    days,
  }
}
