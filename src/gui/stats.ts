import { dayKey, dayStart, monthStart, timezone, weekStart } from "./format"
import type { LedgerDay } from "../rpc.ts"
import type { ModelUsage, SessionStats, StatsBundle, StatsDay, StatsTokens } from "./types"

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

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index])
    }
  })
  await Promise.all(workers)
  return results
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

  for (let offset = -29; offset <= -1; offset += 1) {
    const from = dayStart(offset)
    const date = dayKey(from)
    const cached = options.cache.get(date)
    if (cached) {
      days.push({ date, stats: cached })
      continue
    }
    missing.push({ date, from, to: dayStart(offset + 1) })
  }

  const fetched = await mapLimit(missing, 5, async (item) => ({
    date: item.date,
    stats: await fetchStats(client, {
      ...common,
      from: item.from,
      to: item.to,
      tools: "none",
    }),
  }))

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

function emptyStatsTokens(): StatsTokens {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
}

function addStatsTokens(target: StatsTokens, source: StatsTokens) {
  target.input += source.input
  target.output += source.output
  target.reasoning += source.reasoning
  target.cache.read += source.cache.read
  target.cache.write += source.cache.write
}

function cloneTokens(tokens: StatsTokens): StatsTokens {
  return { ...tokens, cache: { ...tokens.cache } }
}

function ledgerDayToStats(day: LedgerDay): StatsDay {
  return {
    date: day.date,
    stats: {
      range: { from: 0, to: 0 },
      sessions: day.sessions,
      subagents: 0,
      prompts: day.prompts,
      steps: day.steps,
      tokens: cloneTokens(day.tokens),
      cost: 0,
      tools: { mode: "none" },
      activeDays: 0,
      streak: 0,
      activity: [{ date: day.date, steps: day.steps }],
      models: day.models.map((item): ModelUsage => ({
        model: item.model,
        steps: item.steps,
        tokens: cloneTokens(item.tokens),
        cost: 0,
      })),
    },
  }
}

function sumDays(days: StatsDay[]) {
  const tokens = emptyStatsTokens()
  const models = new Map<string, ModelUsage>()
  let steps = 0
  let prompts = 0
  let sessions = 0

  for (const day of days) {
    steps += day.stats.steps
    prompts += day.stats.prompts
    sessions += day.stats.sessions
    addStatsTokens(tokens, day.stats.tokens)
    for (const item of day.stats.models) {
      const key = `${item.model.providerID}/${item.model.id}`
      const existing = models.get(key)
      if (existing) {
        existing.steps += item.steps
        addStatsTokens(existing.tokens, item.tokens)
      } else {
        models.set(key, {
          model: item.model,
          steps: item.steps,
          tokens: cloneTokens(item.tokens),
          cost: 0,
        })
      }
    }
  }

  return { steps, prompts, sessions, tokens, models: [...models.values()] }
}

function sumStatsDay(date: string, days: StatsDay[]): StatsDay {
  const sum = sumDays(days)
  return {
    date,
    stats: {
      ...days[0].stats,
      steps: sum.steps,
      prompts: sum.prompts,
      sessions: sum.sessions,
      tokens: sum.tokens,
      models: sum.models,
      activity: [{ date, steps: sum.steps }],
    },
  }
}

/**
 * Prefer the local ledger for the daily series and for steps/tokens/models.
 * The ledger survives session deletion; session statistics do not.
 */
export function mergeLedger(stats: StatsBundle, ledger: LedgerDay[]): StatsBundle {
  if (ledger.length === 0) return stats

  const grouped = new Map<string, LedgerDay[]>()
  for (const day of ledger) {
    const list = grouped.get(day.date) ?? []
    list.push(day)
    grouped.set(day.date, list)
  }

  const mergedDays = [...grouped.entries()].map(([date, list]) => {
    if (list.length === 1) return ledgerDayToStats(list[0])
    const full = list.find((day) => day.directory === "unknown")
    if (full) return ledgerDayToStats(full)
    return sumStatsDay(date, list.map(ledgerDayToStats))
  })

  const byDate = new Map(mergedDays.map((day) => [day.date, day]))
  const days = stats.days.map((day) => byDate.get(day.date) ?? day)
  for (const day of mergedDays) {
    if (!days.some((item) => item.date === day.date)) days.push(day)
  }
  days.sort((a, b) => a.date.localeCompare(b.date))

  const overlay = (base: SessionStats, from: string): SessionStats => {
    const subset = mergedDays.filter((day) => day.date >= from)
    if (subset.length === 0) return base
    return { ...base, ...sumDays(subset) }
  }

  return {
    ...stats,
    today: overlay(stats.today, dayKey(Date.now())),
    week: overlay(stats.week, dayKey(weekStart())),
    month: overlay(stats.month, dayKey(monthStart())),
    days,
  }
}
