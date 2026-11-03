import { Show, createMemo, onMount, type Accessor } from "solid-js"
import type { GoModel, Meter, UsageSnapshot } from "../rpc.ts"
import type { ConsoleLimits, Prefs, StatsBundle } from "./types"
import type { RequestLog } from "./logs"
import { Sparkline } from "./charts"
import { Select } from "./select"
import { estimateCost, averageContext } from "./model-table"
import { ConsoleSection, DataNotes, HealthSection, LogsSection, ModelSection, TodaySection, TrendSection } from "./sections"
import {
  clamp,
  formatCountdown,
  formatDateTime,
  formatDuration,
  formatReset,
  forecastReset,
  tone,
} from "./format"

type PrefsStore = {
  readonly value: Prefs
  update(mutate: (draft: Prefs) => void): void
}

function MeterCard(props: {
  label: string
  hint: string
  rule: string
  meter?: Meter
  points: number[]
  trend: string
  windowMs: number
}) {
  const percent = () => clamp(props.meter?.percent)
  const remaining = () => 100 - percent()
  const reset = () => {
    const value = formatCountdown(props.meter?.resetsAt)
    return value === "即将重置" ? value : `${value}后`
  }
  const forecast = () => forecastReset(props.meter, props.windowMs)
  const forecastText = () => {
    const value = forecast()
    if (!value) return "按当前速度 · 暂无消耗"
    if (value.willResetFirst) return "按当前速度 · 本周期不会用完"
    return `按当前速度 · ${formatDuration(value.msToFull)}后用完`
  }
  const forecastColor = () => {
    const value = forecast()
    if (!value || value.willResetFirst) return "rgba(127,127,127,0.55)"
    return "#f59e0b"
  }
  const forecastTitle = () => {
    const value = forecast()
    if (!value) return undefined
    return `预计 ${formatDateTime(value.at)} 达到 100%`
  }

  return (
    <div style="border:1px solid rgba(127,127,127,0.2);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;">{props.label}</div>
          <div style="font-size:10px;opacity:0.5;margin-top:2px;">{props.hint}</div>
        </div>
        <div style="text-align:right;">
          <div style={`font-size:24px;font-weight:650;line-height:1;color:${tone(percent())};`}>
            {percent().toFixed(0)}%
          </div>
          <div style="font-size:10px;opacity:0.5;margin-top:3px;">剩余 {remaining().toFixed(0)}%</div>
        </div>
      </div>

      <div style="position:relative;height:8px;border-radius:999px;background:rgba(127,127,127,0.2);overflow:hidden;">
        <div
          style={`height:100%;width:${percent()}%;border-radius:999px;background:${tone(percent())};transition:width 0.3s ease;`}
        />
        <div style="position:absolute;top:-2px;bottom:-2px;left:90%;width:1px;background:rgba(239,68,68,0.55);" />
      </div>

      <div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;opacity:0.55;">
        <span>{props.meter?.limited ? "已触发限流" : props.rule}</span>
        <span>{props.trend}</span>
      </div>

      <Sparkline points={props.points} height={34} color={tone(percent())} />

      <div style="font-size:10px;opacity:0.5;" title={formatReset(props.meter?.resetsAt)}>
        重置 · {reset()}
      </div>
      <div style={`font-size:10px;color:${forecastColor()};`} title={forecastTitle()}>
        {forecastText()}
      </div>
    </div>
  )
}

export function UsagePage(props: {
  usage: Accessor<UsageSnapshot | undefined>
  models: Accessor<GoModel[]>
  stats: Accessor<StatsBundle | undefined>
  limits: Accessor<ConsoleLimits | undefined>
  loading: Accessor<boolean>
  error: Accessor<string | undefined>
  statsError: Accessor<string | undefined>
  modelsError: Accessor<string | undefined>
  prefs: PrefsStore
  projects: Accessor<{ id: string; name: string }[]>
  copyState: Accessor<"idle" | "ok" | "fail">
  logs: Accessor<RequestLog[] | undefined>
  logsError: Accessor<string | undefined>
  logsLoading: Accessor<boolean>
  onLoadLogs: () => void
  onRefreshLogs: () => void
  dark: Accessor<boolean>
  onRefresh: () => void
  onOpenConsole: () => void
  onOpenDocs: () => void
  onCopy: () => void
}) {
  const connected = () => props.usage()?.connected === true
  onMount(() => props.onLoadLogs())
  const catalog = createMemo(() => new Map(props.models().map((model) => [model.id, model])))
  const estimated = () => {
    const today = props.stats()?.today
    if (!today) return 0
    return today.models
      .filter((item) => item.model.providerID === "opencode-go")
      .reduce((sum, item) => {
        const context = averageContext(item.tokens, item.steps)
        return sum + (estimateCost(catalog().get(item.model.id), item.tokens, context) ?? 0)
      }, 0)
  }

  const points = (key: "rolling" | "weekly" | "monthly") => {
    const cutoff = Date.now() - 24 * 60 * 60_000
    return (props.usage()?.history ?? []).filter((sample) => sample.at >= cutoff).map((sample) => sample[key])
  }

  const trend = (key: "rolling" | "weekly" | "monthly") => {
    const values = points(key)
    if (values.length < 2) return "24h 采样中"
    const diff = values[values.length - 1] - values[0]
    return `24h ${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%`
  }

  const buttonStyle = "height:30px;box-sizing:border-box;padding:0 12px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;"

  return (
    <div style="height:100%;min-height:0;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;padding:14px;max-width:100%;display:flex;flex-direction:column;gap:14px;">
      <div style="border:1px solid rgba(127,127,127,0.2);border-radius:12px;background:rgba(127,127,127,0.03);padding:12px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-size:16px;font-weight:650;">OpenCode Go 用量</div>
            <div style="margin-top:4px;font-size:11px;opacity:0.55;">
              官方额度 + 本机 OpenCode 统计 · 每 {Math.round(props.prefs.value.interval / 1000)} 秒自动刷新
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span
              style={`display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;border:1px solid rgba(127,127,127,0.28);font-size:11px;`}
            >
              <span
                style={`width:7px;height:7px;border-radius:999px;background:${connected() ? "#22c55e" : "#ef4444"};`}
              />
              {connected() ? "OpenCode Go 已连接" : "未连接 OpenCode Go"}
            </span>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow-x:auto;">
          <button
            type="button"
            onClick={props.onRefresh}
            disabled={props.loading()}
            style={`${buttonStyle}min-width:76px;text-align:center;opacity:${props.loading() ? "0.5" : "1"};`}
          >
            {props.loading() ? "刷新中…" : "刷新"}
          </button>
          <Select
            value={String(props.prefs.value.interval)}
            options={[
              { value: "10000", label: "10 秒" },
              { value: "30000", label: "30 秒" },
              { value: "60000", label: "60 秒" },
            ]}
            onChange={(value) => {
              const interval = Number(value)
              props.prefs.update((draft) => { draft.interval = interval })
            }}
            width="72px"
            dark={props.dark()}
          />
          <Select
            value={props.prefs.value.projectID ?? "all"}
            options={[
              { value: "all", label: "全部项目" },
              ...props.projects().map((project) => ({ value: project.id, label: project.name })),
            ]}
            onChange={(value) => {
              props.prefs.update((draft) => { draft.projectID = value === "all" ? undefined : value })
            }}
            title="本地统计（今日、趋势、按模型）的范围；官方额度始终是整个账号的"
            width="150px"
            dark={props.dark()}
          />
          <button type="button" onClick={props.onCopy} style={buttonStyle}>
            {props.copyState() === "ok" ? "已复制" : props.copyState() === "fail" ? "复制失败" : "复制摘要"}
          </button>
          <button type="button" onClick={props.onOpenConsole} style={buttonStyle}>
            打开 Console
          </button>
        </div>
      </div>

      <Show when={props.error()}>
        <div style="border:1px solid rgba(239,68,68,0.35);border-radius:9px;padding:10px 12px;font-size:12px;color:#ef4444;line-height:1.6;">
          {props.error()}
        </div>
      </Show>

      <Show when={props.usage() && !connected() && props.usage()?.error}>
        <div style="border:1px solid rgba(127,127,127,0.2);border-radius:9px;padding:12px 14px;font-size:12px;line-height:1.7;">
          {props.usage()?.error}
          <div style="margin-top:6px;font-size:11px;opacity:0.6;">
            在 OpenCode 中运行 /connect，选择 OpenCode Go 并填入 API key 后即可显示额度。
          </div>
        </div>
      </Show>

      <Show when={connected()}>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
          <MeterCard
            label="5 小时窗口"
            hint="滚动窗口"
            rule="官方：月度额度的 20%"
            meter={props.usage()?.rolling}
            points={points("rolling")}
            trend={trend("rolling")}
            windowMs={5 * 60 * 60_000}
          />
          <MeterCard
            label="本周"
            hint="每周额度"
            rule="官方：月度额度的 50%"
            meter={props.usage()?.weekly}
            points={points("weekly")}
            trend={trend("weekly")}
            windowMs={7 * 24 * 60 * 60_000}
          />
          <MeterCard
            label="本月"
            hint="每月额度"
            rule="官方：100%"
            meter={props.usage()?.monthly}
            points={points("monthly")}
            trend={trend("monthly")}
            windowMs={30 * 24 * 60 * 60_000}
          />
        </div>
      </Show>

      <Show when={props.stats()}>
        <TodaySection
          stats={props.stats}
          models={props.models}
          showCost={() => props.prefs.value.showCost}
          estimated={estimated}
        />
        <TrendSection stats={props.stats} />
        <ModelSection stats={props.stats} models={props.models} prefs={props.prefs} />
        <HealthSection stats={props.stats} />
      </Show>

      <Show when={props.statsError()}>
        <div style="font-size:11px;color:#ef4444;opacity:0.85;">{props.statsError()}</div>
      </Show>
      <Show when={props.modelsError()}>
        <div style="font-size:11px;color:#ef4444;opacity:0.85;">{props.modelsError()}</div>
      </Show>

      <ConsoleSection limits={props.limits} onOpenConsole={props.onOpenConsole} />

      <LogsSection
        logs={props.logs}
        error={props.logsError}
        loading={props.logsLoading}
        models={props.models}
        showCost={() => props.prefs.value.showCost}
        onRefresh={props.onRefreshLogs}
      />

      <DataNotes onOpenDocs={props.onOpenDocs} />
    </div>
  )
}
