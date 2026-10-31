import { createSignal } from "solid-js"
import { Command, Plugin, SettingsPage, Slot, TitlebarItem } from "@opencode/plugin/gui"
import { GoUsage, type UsageSnapshot } from "./rpc.ts"
import { UsageBadge, UsagePage } from "./gui/page"

const PAGE_ID = "opencode-go-usage"
const REFRESH_MS = 60_000

export default Plugin.define({
  setup(ctx) {
    const [value, setValue] = createSignal<UsageSnapshot | undefined>()
    const [loading, setLoading] = createSignal(false)
    const [error, setError] = createSignal<string | undefined>()

    let disposed = false

    const load = async (refresh = false) => {
      if (loading()) return
      setLoading(true)
      try {
        const result = (await ctx.client.rpc(GoUsage).get({ refresh })) as UsageSnapshot
        if (disposed) return
        setValue(result)
        setError(undefined)
      } catch (cause) {
        if (disposed) return
        setError(`无法读取 OpenCode Go 用量：${String(cause)}`)
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    const retry = setTimeout(() => {
      if (!value()) void load()
    }, 3_000)

    const open = () => ctx.layout.settings(PAGE_ID)

    ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
      const snapshot = value()
      if (!snapshot?.connected || !snapshot.monthly) return undefined
      const percent = Math.round(snapshot.monthly.percent)
      return {
        id: "usage",
        label: `Go 月 ${percent}%`,
        title: `OpenCode Go · 本月已用 ${percent}%`,
        icon: "window-analytics",
        run: open,
      }
    })

    ctx.add(Slot, {
      at: "session.header",
      order: 40,
      render: () => <UsageBadge value={value} onOpen={open} />,
    })

    ctx.add(SettingsPage, {
      id: PAGE_ID,
      icon: "window-analytics",
      get title() {
        return "OpenCode Go"
      },
      get entries() {
        return [{ id: "overview", title: "OpenCode Go 用量", keywords: "go 额度 usage quota 用量" }]
      },
      render: () => (
        <UsagePage
          value={value}
          loading={loading}
          error={error}
          onRefresh={() => void load(true)}
          onOpenConsole={() => ctx.system.openExternal("https://opencode.ai/console")}
        />
      ),
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
      clearTimeout(retry)
    }
  },
})
