// opencode-go-usage server entry
import { Plugin } from "@opencode/plugin"
import { GoUsage } from "./src/rpc.ts"

const ENDPOINT = "https://opencode.ai/zen/go/v1/usage"
const CACHE_TTL = 60_000

type RawMeter = {
  status?: string
  percent?: number
  resetsAt?: string
}

type RawBody = {
  usage?: {
    rolling?: RawMeter
    weekly?: RawMeter
    monthly?: RawMeter
  }
}

function toMeter(raw: RawMeter | undefined) {
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

export default Plugin.define({
  id: "opencode-go-usage",
  async setup(ctx) {
    let cache: { at: number; value: unknown } | undefined

    const read = async (refresh: boolean) => {
      if (!refresh && cache && Date.now() - cache.at < CACHE_TTL) return cache.value

      let credential: Awaited<ReturnType<typeof ctx.integration.connection.resolve>>
      try {
        const connection = await ctx.integration.connection.active("opencode-go")
        if (!connection) {
          return { connected: false, error: "尚未连接 OpenCode Go，请先在 OpenCode 中连接该提供商。" }
        }
        credential = await ctx.integration.connection.resolve(connection)
      } catch (error) {
        return { connected: false, error: `读取 OpenCode Go 凭据失败：${String(error)}` }
      }

      if (!credential || credential.type !== "key") {
        return { connected: false, error: "OpenCode Go 凭据不可用。" }
      }

      let response: Response
      try {
        response = await fetch(ENDPOINT, {
          headers: {
            Authorization: `Bearer ${credential.key}`,
            Accept: "application/json",
          },
        })
      } catch (error) {
        return { connected: true, error: `请求 OpenCode Go 用量失败：${String(error)}` }
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        return {
          connected: true,
          error: `OpenCode Go 用量接口返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`,
        }
      }

      let body: RawBody
      try {
        body = (await response.json()) as RawBody
      } catch (error) {
        return { connected: true, error: `解析用量数据失败：${String(error)}` }
      }

      const rolling = toMeter(body.usage?.rolling)
      const weekly = toMeter(body.usage?.weekly)
      const monthly = toMeter(body.usage?.monthly)

      if (!rolling || !weekly || !monthly) {
        return { connected: true, error: "用量接口返回的数据格式不符合预期。" }
      }

      const value = {
        connected: true,
        fetchedAt: Date.now(),
        rolling,
        weekly,
        monthly,
      }
      cache = { at: Date.now(), value }
      return value
    }

    await ctx.rpc.register(GoUsage, {
      get: async (input) => read((input as { refresh?: boolean } | undefined)?.refresh === true),
    })
  },
})
