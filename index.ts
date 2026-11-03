// opencode-go-usage server entry
import { Plugin } from "@opencode/plugin"
import {
  GoUsage,
  type GoModel,
  type GoModels,
  type Meter,
  type PeakPrice,
  type PriceTier,
  type Sample,
  type UsageSnapshot,
} from "./src/rpc.ts"

const USAGE_ENDPOINT = "https://opencode.ai/zen/go/v1/usage"
const MODELS_ENDPOINT = "https://opencode.ai/zen/go/v1/models"
const CONSOLE_MODELS_ENDPOINT = "https://opencode.ai/inference/v1/models"
const USAGE_TTL = 15_000
const MODELS_TTL = 10 * 60_000
const SAMPLE_INTERVAL = 60_000
const HISTORY_WINDOW = 24 * 60 * 60_000
const HISTORY_KEY = "usage-history"

type RawMeter = {
  status?: string
  percent?: number
  resetsAt?: string
}

type RawUsageBody = {
  usage?: {
    rolling?: RawMeter
    weekly?: RawMeter
    monthly?: RawMeter
  }
}

type RawPriceOverride = {
  when?: { context?: { gt?: number } }
  price?: number
  cache?: { read?: number; write?: number }
}

type RawMultiplier = {
  when?: {
    utc_days?: string[] | { in?: string[] }
    any?: { all?: { utc_hours?: { gte?: string; lt?: string } }[] }[]
  }
  factor?: number
}

type RawModelCost = {
  text?: {
    input?: {
      price?: number
      cache?: { read?: number; write?: number }
      overrides?: RawPriceOverride[]
    }
    output?: {
      price?: number
      overrides?: RawPriceOverride[]
    }
    cache?: { read?: number; write?: number }
  }
  multipliers?: RawMultiplier[]
}

type RawModel = {
  id?: string
  name?: string
  cost?: RawModelCost
  limit?: { context?: number; output?: number }
}

type RawModelsBody = {
  data?: RawModel[]
}

function toMeter(raw: RawMeter | undefined): Meter | undefined {
  if (!raw) return undefined
  if (typeof raw.percent !== "number" || !Number.isFinite(raw.percent)) return undefined
  const resetsAt = typeof raw.resetsAt === "string" ? Date.parse(raw.resetsAt) : Number.NaN
  if (!Number.isFinite(resetsAt)) return undefined

  return {
    percent: Math.max(0, Math.min(100, raw.percent)),
    limited: raw.status === "rate-limited",
    resetsAt,
  }
}

function price(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function toTiers(text: RawModelCost["text"]): PriceTier[] {
  if (!text) return []
  const inputOverrides = text.input?.overrides ?? []
  const outputOverrides = text.output?.overrides ?? []
  const thresholds = new Set<number>()
  for (const item of [...inputOverrides, ...outputOverrides]) {
    const gt = item.when?.context?.gt
    if (typeof gt === "number" && Number.isFinite(gt)) thresholds.add(gt)
  }

  const tiers: PriceTier[] = []
  for (const gt of thresholds) {
    const input = inputOverrides.find((item) => item.when?.context?.gt === gt)
    const output = outputOverrides.find((item) => item.when?.context?.gt === gt)
    tiers.push({
      contextGt: gt,
      input: price(input?.price ?? text.input?.price),
      output: price(output?.price ?? text.output?.price),
      cacheRead: price(input?.cache?.read ?? text.input?.cache?.read ?? text.cache?.read),
      cacheWrite: price(input?.cache?.write ?? text.input?.cache?.write ?? text.cache?.write),
    })
  }
  return tiers.sort((a, b) => a.contextGt - b.contextGt)
}

const DAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

function toPeak(multipliers: RawMultiplier[] | undefined): PeakPrice | undefined {
  for (const item of multipliers ?? []) {
    const factor = typeof item.factor === "number" && item.factor > 1 ? item.factor : undefined
    if (!factor) continue

    const windows: { start: string; end: string }[] = []
    for (const group of item.when?.any ?? []) {
      const gte = group.all?.find((condition) => condition.utc_hours?.gte)?.utc_hours?.gte
      const lt = group.all?.find((condition) => condition.utc_hours?.lt)?.utc_hours?.lt
      if (gte && lt) windows.push({ start: gte, end: lt })
    }
    if (windows.length === 0) continue

    const rawDays = item.when?.utc_days
    const dayList = Array.isArray(rawDays) ? rawDays : Array.isArray(rawDays?.in) ? rawDays.in : []
    const days = dayList
      .map((day) => DAY_INDEX[String(day).toLowerCase()])
      .filter((day): day is number => typeof day === "number")

    return { factor, windows, utcDays: days.length > 0 ? days : undefined }
  }
  return undefined
}

function toModel(raw: RawModel): GoModel | undefined {
  if (typeof raw.id !== "string" || !raw.id) return undefined

  const text = raw.cost?.text
  const input = price(text?.input?.price)
  const output = price(text?.output?.price)
  const model: GoModel = {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
    input,
    output,
    cacheRead: price(text?.input?.cache?.read ?? text?.cache?.read),
    cacheWrite: price(text?.input?.cache?.write ?? text?.cache?.write),
    context: price(raw.limit?.context),
    outputLimit: price(raw.limit?.output),
    tiers: toTiers(text),
    free: input === 0 && output === 0,
  }

  const peak = toPeak(raw.cost?.multipliers)
  if (peak) model.peak = peak
  return model
}

function isSample(value: unknown): value is Sample {
  if (!value || typeof value !== "object") return false
  const sample = value as Record<string, unknown>
  return (
    typeof sample.at === "number" &&
    typeof sample.rolling === "number" &&
    typeof sample.weekly === "number" &&
    typeof sample.monthly === "number"
  )
}

export default Plugin.define({
  id: "opencode-go-usage",
  async setup(ctx) {
    let history: Sample[] = []
    try {
      const stored = await ctx.storage.get(HISTORY_KEY)
      if (Array.isArray(stored)) {
        const cutoff = Date.now() - HISTORY_WINDOW
        history = stored.filter(isSample).filter((sample) => sample.at >= cutoff)
      }
    } catch {
      history = []
    }

    const getCredential = async (): Promise<{ key: string } | { error: string }> => {
      try {
        const connection = await ctx.integration.connection.active("opencode-go")
        if (!connection) return { error: "尚未连接 OpenCode Go，请先在 OpenCode 中连接该提供商。" }
        const credential = await ctx.integration.connection.resolve(connection)
        if (!credential || credential.type !== "key") return { error: "OpenCode Go 凭据不可用。" }
        return { key: credential.key }
      } catch (error) {
        return { error: `读取 OpenCode Go 凭据失败：${String(error)}` }
      }
    }

    const appendSample = (rolling: Meter, weekly: Meter, monthly: Meter) => {
      const now = Date.now()
      if (history.length > 0 && now - history[history.length - 1].at < SAMPLE_INTERVAL) return
      history = history.filter((sample) => sample.at >= now - HISTORY_WINDOW)
      history.push({
        at: now,
        rolling: rolling.percent,
        weekly: weekly.percent,
        monthly: monthly.percent,
      })
      void ctx.storage.set(HISTORY_KEY, history).catch((error) => {
        console.error("[opencode-go-usage] failed to save history", error)
      })
    }

    let usageCache: { at: number; value: UsageSnapshot } | undefined
    let usageInflight: Promise<UsageSnapshot> | undefined

    const readUsage = async (refresh: boolean): Promise<UsageSnapshot> => {
      if (!refresh && usageCache && Date.now() - usageCache.at < USAGE_TTL) {
        return { ...usageCache.value, history }
      }
      if (usageInflight) return usageInflight

      usageInflight = (async () => {
        const credential = await getCredential()
        if ("error" in credential) {
          return { connected: false, error: credential.error, history }
        }

        const started = Date.now()
        let response: Awaited<ReturnType<typeof fetch>>
        try {
          response = await fetch(USAGE_ENDPOINT, {
            headers: {
              Authorization: `Bearer ${credential.key}`,
              Accept: "application/json",
            },
          })
        } catch (error) {
          return { connected: true, error: `请求 OpenCode Go 用量失败：${String(error)}`, history }
        }
        const latencyMs = Date.now() - started

        if (!response.ok) {
          const detail = await response.text().catch(() => "")
          return {
            connected: true,
            error: `OpenCode Go 用量接口返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`,
            latencyMs,
            history,
          }
        }

        let body: RawUsageBody
        try {
          body = (await response.json()) as RawUsageBody
        } catch (error) {
          return { connected: true, error: `解析用量数据失败：${String(error)}`, latencyMs, history }
        }

        const rolling = toMeter(body.usage?.rolling)
        const weekly = toMeter(body.usage?.weekly)
        const monthly = toMeter(body.usage?.monthly)

        if (!rolling || !weekly || !monthly) {
          return { connected: true, error: "用量接口返回的数据格式不符合预期。", latencyMs, history }
        }

        appendSample(rolling, weekly, monthly)
        const value: UsageSnapshot = {
          connected: true,
          fetchedAt: Date.now(),
          latencyMs,
          rolling,
          weekly,
          monthly,
          history,
        }
        usageCache = { at: Date.now(), value }
        return value
      })().finally(() => {
        usageInflight = undefined
      })

      return usageInflight
    }

    let modelsCache: { at: number; value: GoModels } | undefined
    let modelsInflight: Promise<GoModels> | undefined

    const readModels = async (refresh: boolean): Promise<GoModels> => {
      if (!refresh && modelsCache && Date.now() - modelsCache.at < MODELS_TTL) return modelsCache.value
      if (modelsInflight) return modelsInflight

      modelsInflight = (async () => {
        const credential = await getCredential()
        if ("error" in credential) {
          return { fetchedAt: Date.now(), models: [], error: credential.error }
        }

        const headers = {
          Authorization: `Bearer ${credential.key}`,
          Accept: "application/json",
        }

        const [goResult, consoleResult] = await Promise.allSettled([
          fetch(MODELS_ENDPOINT, { headers }),
          fetch(CONSOLE_MODELS_ENDPOINT, { headers }),
        ])

        if (goResult.status === "rejected") {
          return {
            fetchedAt: Date.now(),
            models: [],
            error: `请求模型列表失败：${String(goResult.reason)}`,
          }
        }

        const goResponse = goResult.value
        if (!goResponse.ok) {
          return {
            fetchedAt: Date.now(),
            models: [],
            error: `模型列表接口返回 HTTP ${goResponse.status}`,
          }
        }

        let goBody: RawModelsBody
        try {
          goBody = (await goResponse.json()) as RawModelsBody
        } catch (error) {
          return { fetchedAt: Date.now(), models: [], error: `解析模型列表失败：${String(error)}` }
        }

        let consoleBody: RawModelsBody | undefined
        if (consoleResult.status === "fulfilled" && consoleResult.value.ok) {
          try {
            consoleBody = (await consoleResult.value.json()) as RawModelsBody
          } catch {
            consoleBody = undefined
          }
        }

        const byId = new Map<string, GoModel>()
        for (const raw of [...(consoleBody?.data ?? []), ...(goBody.data ?? [])]) {
          const model = toModel(raw)
          if (model) byId.set(model.id, model)
        }
        const models = [...byId.values()]
        const value = { fetchedAt: Date.now(), models }
        modelsCache = { at: Date.now(), value }
        return value
      })().finally(() => {
        modelsInflight = undefined
      })

      return modelsInflight
    }

    await ctx.rpc.register(GoUsage, {
      get: async (input) => readUsage((input as { refresh?: boolean } | undefined)?.refresh === true),
      models: async (input) => readModels((input as { refresh?: boolean } | undefined)?.refresh === true),
    })
  },
})
