import type { LedgerDay, LedgerModel, LedgerTokens } from "../rpc.ts"

const KEY = "usage-ledger"
const RETENTION_DAYS = 90
const SEEN_LIMIT = 3000

type ModelRef = { id: string; providerID: string; variant?: string }

type StoredModel = {
  model: ModelRef
  steps: number
  tokens: LedgerTokens
}

type StoredDay = {
  directory: string
  date: string
  steps: number
  prompts: number
  sessions: string[]
  sessionCount: number
  tokens: LedgerTokens
  models: StoredModel[]
}

type StoredLedger = {
  days: StoredDay[]
  seen: string[]
}

type Storage = {
  get(key: string): Promise<unknown>
  set(key: string, value: any): Promise<void>
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function emptyTokens(): LedgerTokens {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
}

function normalizeTokens(value: Partial<LedgerTokens> | undefined): LedgerTokens {
  const cache = (value?.cache ?? {}) as { read?: unknown; write?: unknown }
  return {
    input: num(value?.input),
    output: num(value?.output),
    reasoning: num(value?.reasoning),
    cache: { read: num(cache.read), write: num(cache.write) },
  }
}

function addTokens(target: LedgerTokens, source: Partial<LedgerTokens> | undefined) {
  const tokens = normalizeTokens(source)
  target.input += tokens.input
  target.output += tokens.output
  target.reasoning += tokens.reasoning
  target.cache.read += tokens.cache.read
  target.cache.write += tokens.cache.write
}

function dayKey(at: number) {
  const date = new Date(at)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function isStoredDay(value: unknown): value is StoredDay {
  if (!value || typeof value !== "object") return false
  const day = value as Record<string, unknown>
  return typeof day.date === "string" && typeof day.directory === "string" && Array.isArray(day.models)
}

export function createLedger(storage: Storage) {
  let days: StoredDay[] = []
  let seen = new Set<string>()
  const models = new Map<string, ModelRef>()
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function prune() {
    const cutoff = dayKey(Date.now() - RETENTION_DAYS * 86_400_000)
    days = days.filter((day) => day.date >= cutoff)
  }

  function schedule() {
    dirty = true
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, 2_000)
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (!dirty) return
    dirty = false
    prune()
    const payload: StoredLedger = { days, seen: [...seen].slice(-SEEN_LIMIT) }
    try {
      await storage.set(KEY, payload)
    } catch {
      dirty = true
    }
  }

  async function load() {
    try {
      const raw = (await storage.get(KEY)) as StoredLedger | undefined
      if (raw && Array.isArray(raw.days)) {
        days = raw.days.filter(isStoredDay).map((day) => ({
          ...day,
          sessions: Array.isArray(day.sessions) ? day.sessions : [],
          sessionCount: typeof day.sessionCount === "number" ? day.sessionCount : 0,
        }))
      }
      if (raw && Array.isArray(raw.seen)) {
        seen = new Set(raw.seen.filter((id): id is string => typeof id === "string"))
      }
    } catch {
      days = []
      seen = new Set()
    }
    prune()
  }

  function seed(sessions: readonly { id?: string; model?: ModelRef }[]) {
    for (const session of sessions) {
      if (typeof session.id === "string" && session.model && typeof session.model.id === "string") {
        models.set(session.id, session.model)
      }
    }
  }

  function record(
    at: number,
    directory: string,
    sessionID: string,
    model: ModelRef,
    tokens: Partial<LedgerTokens> | undefined,
    steps: number,
  ) {
    if (!Number.isFinite(at) || at <= 0) return
    const date = dayKey(at)
    let day = days.find((item) => item.directory === directory && item.date === date)
    if (!day) {
      day = {
        directory,
        date,
        steps: 0,
        prompts: 0,
        sessions: [],
        sessionCount: 0,
        tokens: emptyTokens(),
        models: [],
      }
      days.push(day)
    }

    day.steps += steps
    addTokens(day.tokens, tokens)
    if (sessionID && !day.sessions.includes(sessionID)) day.sessions.push(sessionID)

    const key = `${model.providerID}/${model.id}`
    let entry = day.models.find((item) => `${item.model.providerID}/${item.model.id}` === key)
    if (!entry) {
      entry = {
        model: {
          id: model.id,
          providerID: model.providerID,
          ...(model.variant ? { variant: model.variant } : {}),
        },
        steps: 0,
        tokens: emptyTokens(),
      }
      day.models.push(entry)
    }
    entry.steps += steps
    addTokens(entry.tokens, tokens)
    schedule()
  }

  function handle(event: any) {
    if (!event || typeof event.type !== "string") return
    const data = event.data
    if (!data || typeof data !== "object") return

    const directory =
      typeof event.location?.directory === "string" && event.location.directory
        ? event.location.directory
        : "unknown"

    if (event.type === "session.model.selected") {
      const sessionID = data.sessionID
      const model = data.model
      if (
        typeof sessionID === "string" &&
        model &&
        typeof model.id === "string" &&
        typeof model.providerID === "string"
      ) {
        models.set(sessionID, {
          id: model.id,
          providerID: model.providerID,
          ...(typeof model.variant === "string" ? { variant: model.variant } : {}),
        })
      }
      return
    }

    if (event.type === "session.step.ended") {
      const sessionID = String(data.sessionID ?? "")
      const messageID = String(data.assistantMessageID ?? "")
      const key = `step:${sessionID}:${messageID}`
      if (!sessionID || seen.has(key)) return
      seen.add(key)
      const model = models.get(sessionID) ?? { id: "unknown", providerID: "unknown" }
      record(num(event.created), directory, sessionID, model, data.tokens, 1)
      return
    }

    if (event.type === "session.usage.recorded") {
      const sessionID = String(data.sessionID ?? "")
      const source = String(data.source ?? "internal")
      const key = `usage:${String(event.id ?? `${sessionID}:${event.created}`)}`
      if (!sessionID || seen.has(key)) return
      seen.add(key)
      const model = models.get(sessionID) ?? { id: source, providerID: "internal" }
      record(num(event.created), directory, sessionID, model, data.tokens, 0)
    }
  }

  function snapshot(directory?: string): LedgerDay[] {
    const filtered = directory ? days.filter((day) => day.directory === directory) : days
    return filtered
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({
        directory: day.directory,
        date: day.date,
        steps: day.steps,
        prompts: day.prompts,
        sessions: Math.max(day.sessions.length, day.sessionCount ?? 0),
        tokens: normalizeTokens(day.tokens),
        models: day.models.map((item): LedgerModel => ({
          model: {
            id: item.model.id,
            providerID: item.model.providerID,
            ...(item.model.variant ? { variant: item.model.variant } : {}),
          },
          steps: item.steps,
          tokens: normalizeTokens(item.tokens),
        })),
      }))
  }

  function backfill(directory: string, input: LedgerDay[]) {
    let changed = 0
    for (const day of input) {
      if (!day || typeof day.date !== "string") continue

      const steps = num(day.steps)
      const prompts = num(day.prompts)
      const sessionCount = num(day.sessions)
      const tokens = normalizeTokens(day.tokens)
      const models = (day.models ?? []).map((item) => ({
        model: {
          id: String(item.model?.id ?? ""),
          providerID: String(item.model?.providerID ?? ""),
          ...(item.model?.variant ? { variant: item.model.variant } : {}),
        },
        steps: num(item.steps),
        tokens: normalizeTokens(item.tokens),
      }))

      let existing = days.find((item) => item.directory === directory && item.date === day.date)
      if (!existing) {
        days.push({
          directory,
          date: day.date,
          steps,
          prompts,
          sessions: [],
          sessionCount,
          tokens,
          models,
        })
        changed += 1
        continue
      }

      if (steps > existing.steps) {
        existing.steps = steps
        changed += 1
      }
      if (prompts > existing.prompts) {
        existing.prompts = prompts
        changed += 1
      }
      if (sessionCount > existing.sessionCount) {
        existing.sessionCount = sessionCount
        changed += 1
      }

      existing.tokens.input = Math.max(existing.tokens.input, tokens.input)
      existing.tokens.output = Math.max(existing.tokens.output, tokens.output)
      existing.tokens.reasoning = Math.max(existing.tokens.reasoning, tokens.reasoning)
      existing.tokens.cache.read = Math.max(existing.tokens.cache.read, tokens.cache.read)
      existing.tokens.cache.write = Math.max(existing.tokens.cache.write, tokens.cache.write)

      for (const item of models) {
        const key = `${item.model.providerID}/${item.model.id}`
        const entry = existing.models.find(
          (model) => `${model.model.providerID}/${model.model.id}` === key,
        )
        if (!entry) {
          existing.models.push(item)
          changed += 1
          continue
        }
        if (item.steps > entry.steps) {
          entry.steps = item.steps
          changed += 1
        }
        entry.tokens.input = Math.max(entry.tokens.input, item.tokens.input)
        entry.tokens.output = Math.max(entry.tokens.output, item.tokens.output)
        entry.tokens.reasoning = Math.max(entry.tokens.reasoning, item.tokens.reasoning)
        entry.tokens.cache.read = Math.max(entry.tokens.cache.read, item.tokens.cache.read)
        entry.tokens.cache.write = Math.max(entry.tokens.cache.write, item.tokens.cache.write)
      }
    }
    if (changed > 0) schedule()
    return changed
  }

  return { load, seed, handle, flush, snapshot, backfill }
}
