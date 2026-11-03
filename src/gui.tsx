import { createEffect, createSignal } from "solid-js"
import { Schema } from "effect"
import { Command, MenuItem, Panel, Plugin, Slot, Store } from "@opencode/plugin/gui"
import type { PanelTab } from "@opencode/plugin/gui"
import { GoUsage, type GoModel, type GoModels, type UsageSnapshot } from "./rpc.ts"
import type { ConsoleLimits, Prefs, SessionStats, StatsBundle } from "./gui/types.ts"
import { loadStatsBundle } from "./gui/stats.ts"
import { loadRequestLogs, type RequestLog } from "./gui/logs.ts"
import { estimateCost, averageContext } from "./gui/model-table.tsx"
import { formatMoney, formatPercent, formatTokens, sumTokens } from "./gui/format.ts"
import { UsageBadge } from "./gui/badge.tsx"
import { UsagePage } from "./gui/page.tsx"

const PANEL_ID = "usage"
const PANEL_KEY = "opencode-go-usage:usage"
const TICK = 5_000
const STATS_INTERVAL = 60_000
const MODELS_INTERVAL = 10 * 60_000
const LIMITS_INTERVAL = 60_000
const LOG_AUTO_REFRESH = 60_000

const PrefsSchema = Schema.Struct({
  interval: Schema.Number,
  scope: Schema.Literals(["all", "current"]),
  projectID: Schema.optional(Schema.String),
  modelScope: Schema.Literals(["go", "all"]),
  modelRange: Schema.Literals(["week", "month"]),
  showCost: Schema.Boolean,
})

const initialPrefs: Prefs = {
  interval: 10_000,
  scope: "all",
  modelScope: "go",
  modelRange: "week",
  showCost: true,
}

export default Plugin.define({
  stores: {
    prefs: Store.global(PrefsSchema, initialPrefs),
  },
  setup(ctx) {
    const prefs = ctx.stores.prefs
    const [usage, setUsage] = createSignal<UsageSnapshot | undefined>()
    const [models, setModels] = createSignal<GoModel[]>([])
    const [stats, setStats] = createSignal<StatsBundle | undefined>()
    const [limits, setLimits] = createSignal<ConsoleLimits | undefined>()
    const [projects, setProjects] = createSignal<{ id: string; name: string }[]>([])
    const [logs, setLogs] = createSignal<RequestLog[] | undefined>()
    const [logsError, setLogsError] = createSignal<string | undefined>()
    const [logsLoading, setLogsLoading] = createSignal(false)
    const [loading, setLoading] = createSignal(false)
    const [copyState, setCopyState] = createSignal<"idle" | "ok" | "fail">("idle")
    const [error, setError] = createSignal<string | undefined>()
    const [statsError, setStatsError] = createSignal<string | undefined>()
    const [modelsError, setModelsError] = createSignal<string | undefined>()

    const statsCache = new Map<string, SessionStats>()
    let disposed = false
    let copyTimer: ReturnType<typeof setTimeout> | undefined
    let usageLoading = false
    let statsLoading = false
    let statsAgain = false

    const projectFilter = () => prefs.value.projectID

    const loadProjects = async () => {
      try {
        const result = (await ctx.client.project.list()) as unknown
        const list = Array.isArray(result)
          ? result
          : Array.isArray((result as { data?: unknown }).data)
            ? (result as { data: unknown[] }).data
            : []
        if (!disposed) {
          setProjects(
            list.map((item) => {
              const project = item as { id?: string; name?: string; canonical?: string; worktree?: string }
              const canonical = typeof project.canonical === "string" ? project.canonical : ""
              const folder = canonical.split(/[\\/]/).filter(Boolean).pop()
              return {
                id: String(project.id ?? ""),
                name: project.name ?? folder ?? project.worktree ?? String(project.id ?? ""),
              }
            }).filter((project) => project.id.length > 0),
          )
        }
      } catch {
        if (!disposed) setProjects([])
      }
    }

    const loadUsage = async (refresh = false) => {
      if (usageLoading) return
      usageLoading = true
      setLoading(true)
      try {
        const result = (await ctx.client.rpc(GoUsage).get({ refresh })) as UsageSnapshot
        if (disposed) return
        setUsage(result)
        setError(undefined)
      } catch (cause) {
        if (!disposed) setError(`无法读取 OpenCode Go 用量：${String(cause)}`)
      } finally {
        usageLoading = false
        if (!disposed) setLoading(false)
      }
    }

    const loadModels = async (refresh = false) => {
      try {
        const result = (await ctx.client.rpc(GoUsage).models({ refresh })) as GoModels
        if (disposed) return
        setModels(result.models)
        setModelsError(result.error)
      } catch (cause) {
        if (!disposed) setModelsError(`无法读取 Go 模型价格：${String(cause)}`)
      }
    }

    const loadStats = async () => {
      if (statsLoading) {
        statsAgain = true
        return
      }
      statsLoading = true
      try {
        const result = await loadStatsBundle(ctx.client as never, {
          project: projectFilter(),
          cache: statsCache,
        })
        if (disposed) return
        setStats(result)
        setStatsError(undefined)
      } catch (cause) {
        if (!disposed) setStatsError(`无法读取本机使用统计：${String(cause)}`)
      } finally {
        statsLoading = false
        if (!disposed && statsAgain) {
          statsAgain = false
          void loadStats()
        }
      }
    }

    const loadLimits = async () => {
      try {
        const result = await (ctx.client as unknown as {
          usage: { limits(): Promise<unknown> }
        }).usage.limits()
        if (!disposed) setLimits((result ?? null) as ConsoleLimits)
      } catch {
        if (!disposed) setLimits(undefined)
      }
    }

    const LOG_LIMIT = 50
    let lastLogsAt = 0
    let lastLogsKey = ""
    let lastLogsAttempt = 0

    const loadLogs = async (refresh = false) => {
      lastLogsAttempt = Date.now()
      const key = `${projectFilter() ?? "all"}:${LOG_LIMIT}`
      if (!refresh && logs() !== undefined && key === lastLogsKey && Date.now() - lastLogsAt < 60_000) return
      if (logsLoading()) return
      setLogsLoading(true)
      try {
        const result = await loadRequestLogs(ctx.client as never, {
          project: projectFilter(),
          limit: LOG_LIMIT,
        })
        if (disposed) return
        setLogs(result)
        setLogsError(undefined)
        lastLogsKey = key
        lastLogsAt = Date.now()
      } catch (cause) {
        if (!disposed) setLogsError(`无法读取请求日志：${String(cause)}`)
      } finally {
        if (!disposed) setLogsLoading(false)
      }
    }

    const refreshAll = () => {
      void loadUsage(true)
      void loadStats()
      void loadModels(true)
      void loadLimits()
      void loadProjects()
      void loadLogs(true)
    }

    const estimatedToday = () => {
      const today = stats()?.today
      if (!today) return 0
      const catalog = new Map(models().map((model) => [model.id, model]))
      return today.models
        .filter((item) => item.model.providerID === "opencode-go")
        .reduce((sum, item) => {
          const context = averageContext(item.tokens, item.steps)
          return sum + (estimateCost(catalog.get(item.model.id), item.tokens, context) ?? 0)
        }, 0)
    }

    const copySummary = async () => {
      const value = usage()
      const today = stats()?.today
      const lines = [
        `OpenCode Go 用量 · ${new Date().toLocaleString("zh-CN")}`,
        value?.connected
          ? `5h ${formatPercent(value.rolling?.percent)} · 周 ${formatPercent(value.weekly?.percent)} · 月 ${formatPercent(value.monthly?.percent)}`
          : "未连接 OpenCode Go",
      ]
      if (today) lines.push(`今日 ${today.steps} steps · ${formatTokens(sumTokens(today.tokens))} tokens`)
      if (estimatedToday() > 0) lines.push(`今日估算 ${formatMoney(estimatedToday())}`)

      const text = lines.join("\n")
      let ok = false
      try {
        await ctx.system.copy(text)
        ok = true
      } catch {
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(text)
            ok = true
          }
        } catch {
          ok = false
        }
      }

      if (!ok && typeof document !== "undefined") {
        try {
          const textarea = document.createElement("textarea")
          textarea.value = text
          textarea.style.position = "fixed"
          textarea.style.opacity = "0"
          document.body.appendChild(textarea)
          textarea.select()
          ok = document.execCommand("copy")
          textarea.remove()
        } catch {
          ok = false
        }
      }

      setCopyState(ok ? "ok" : "fail")
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => setCopyState("idle"), 1_600)
    }

    const open = () => {
      const session = ctx.sessions.current()
      if (!session) {
        ctx.toast.show({
          title: "先打开一个会话",
          description: "Go 用量面板显示在会话右侧",
        })
        return
      }
      ctx.layout.open(PANEL_KEY, session)
    }
    const openConsole = () => void ctx.system.openExternal("https://opencode.ai/console")
    const openDocs = () => void ctx.system.openExternal("https://opencode.ai/v2/docs/console/go/")

    const prefsStore = {
      get value() {
        return prefs.value
      },
      update(mutate: (draft: Prefs) => void) {
        prefs.update((draft) => {
          mutate(draft)
          return undefined
        })
      },
    }

    void loadUsage()
    void loadModels(false)
    void loadStats()
    void loadLimits()
    void loadProjects()

    let lastUsage = Date.now()
    let lastStats = Date.now()
    let lastModels = Date.now()
    let lastLimits = Date.now()

    let lastProject = prefs.value.projectID ?? "all"
    createEffect(() => {
      const key = prefs.value.projectID ?? "all"
      if (key === lastProject) return
      lastProject = key
      statsCache.clear()
      setLogs(undefined)
      lastLogsAt = 0
      void loadStats()
    })

    const timer = setInterval(() => {
      const now = Date.now()
      if (now - lastUsage >= prefs.value.interval) {
        lastUsage = now
        void loadUsage()
      }
      if (now - lastStats >= STATS_INTERVAL) {
        lastStats = now
        void loadStats()
      }
      if (now - lastModels >= MODELS_INTERVAL) {
        lastModels = now
        void loadModels()
      }
      if (now - lastLimits >= LIMITS_INTERVAL) {
        lastLimits = now
        void loadLimits()
      }
      if (logs() !== undefined && now - lastLogsAttempt >= LOG_AUTO_REFRESH) {
        void loadLogs(true)
      }
    }, TICK)

    ctx.add(Slot, {
      at: "session.header",
      order: 40,
      render: () => <UsageBadge value={usage} onOpen={open} />,
    })

    const panelTab: PanelTab = {
      id: PANEL_ID,
      title: "OpenCode Go 用量",
      label: () => "Go 用量",
    }

    ctx.add(Panel, {
      id: PANEL_ID,
      region: "side",
      wide: true,
      mobile: {
        title: "Go 用量",
        order: 40,
        kind: "tab",
        icon: "window-analytics",
      },
      list: (input) => (input.open.includes(PANEL_ID) ? [panelTab] : []),
      render: () => (
        <UsagePage
          usage={usage}
          models={models}
          stats={stats}
          limits={limits}
          loading={loading}
          error={error}
          statsError={statsError}
          modelsError={modelsError}
          prefs={prefsStore}
          projects={projects}
          copyState={copyState}
          logs={logs}
          logsError={logsError}
          logsLoading={logsLoading}
          onLoadLogs={() => void loadLogs()}
          onRefreshLogs={() => void loadLogs(true)}
          onRefresh={refreshAll}
          onOpenConsole={openConsole}
          onOpenDocs={openDocs}
          onCopy={copySummary}
        />
      ),
    })

    ctx.add(MenuItem, {
      menu: "session.panel",
      id: PANEL_ID,
      title: "Go 用量",
      icon: "window-analytics",
      run: open,
    })

    ctx.add(Command, () => ({
      id: "usage",
      title: "查看 OpenCode Go 用量",
      keywords: "go quota usage 额度",
      group: "OpenCode Go",
      run: open,
    }))

    return () => {
      disposed = true
      clearInterval(timer)
      clearTimeout(copyTimer)
    }
  },
})
