import type { StatsTokens } from "./types"

export type RequestLog = {
  id: string
  at: number
  model: { id: string; providerID: string; variant?: string }
  status: "ok" | "pending"
  durationMs?: number
  tokens: StatsTokens
  sessionID: string
  sessionTitle?: string
}

type LogClient = {
  session: {
    list(input?: { limit?: number; order?: "asc" | "desc"; project?: string }): Promise<unknown>
  }
  message: {
    list(input: {
      sessionID: string
      type?: string
      limit?: number
      order?: "asc" | "desc"
    }): Promise<unknown>
  }
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
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

function rows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  const record = (value ?? {}) as Record<string, unknown>
  return Array.isArray(record.data) ? (record.data as Record<string, unknown>[]) : []
}

function toLog(session: Record<string, unknown>, message: Record<string, unknown>): RequestLog | undefined {
  const time = (message.time ?? {}) as Record<string, unknown>
  const at = num(time.created)
  if (!at) return undefined

  const completed = num(time.completed)
  const streamed = num(time.streamed)
  const finished = completed || streamed
  const model = (message.model ?? {}) as Record<string, unknown>

  return {
    id: String(message.id ?? `${session.id}:${at}`),
    at,
    model: {
      id: String(model.id ?? ""),
      providerID: String(model.providerID ?? ""),
      variant: typeof model.variant === "string" ? model.variant : undefined,
    },
    status: completed > 0 ? "ok" : "pending",
    durationMs: finished > at ? finished - at : undefined,
    tokens: readTokens(message.tokens),
    sessionID: String(session.id ?? ""),
    sessionTitle: typeof session.title === "string" ? session.title : undefined,
  }
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

export async function loadRequestLogs(
  client: LogClient,
  options: { project?: string; limit?: number },
): Promise<RequestLog[]> {
  const limit = Math.max(1, options.limit ?? 20)
  const sessionResult = await client.session.list({
    limit: Math.max(10, Math.min(40, limit)),
    order: "desc",
    ...(options.project ? { project: options.project } : {}),
  })

  const sessions = rows(sessionResult)
  if (sessions.length === 0) return []

  const perSession = Math.max(5, Math.min(20, Math.ceil(limit / 2)))
  const groups = await mapLimit(sessions, 4, async (session) => {
    const sessionID = String(session.id ?? "")
    if (!sessionID) return []
    try {
      const result = await client.message.list({
        sessionID,
        type: "assistant",
        limit: perSession,
        order: "desc",
      })
      return rows(result)
        .map((message) => toLog(session, message))
        .filter((item): item is RequestLog => item !== undefined)
    } catch {
      return []
    }
  })

  return groups
    .flat()
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
}
