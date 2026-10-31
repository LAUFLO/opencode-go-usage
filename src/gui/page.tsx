import { For, Show, createMemo, type Accessor } from "solid-js"
import type { GoModel, Meter, UsageSnapshot } from "../rpc.ts"
import type { ConsoleLimits, Prefs, StatsBundle } from "./types"
import { Sparkline } from "./charts"
import { estimateCost } from "./model-table"
import { ConsoleSection, DataNotes, HealthSection, ModelSection, TodaySection, TrendSection } from "./sections"
import { clamp, formatCountdown, formatReset, tone } from "./format"

type PrefsStore = {
  readonly value: Prefs
  update(mutate: (draft: Prefs) => void): void
}

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
const PRIMARY =
  "height:28px;box-sizing:border-box;padding:0 13px;border-radius:3px;border:none;background:#2563eb;color:#fff;font-size:11px;font-weight:600;cursor:pointer;"
const SELECT =
  "height:28px;box-sizing:border-box;padding:0 8px;border-radius:3px;border:1px solid rgba(127,127,127,0.22);background:transparent;color:inherit;font-size:11px;"
const LINK =
  "border:none;border-bottom:1px solid rgba(127,127,127,0.25);background:none;color:inherit;font-size:11px;padding:0 0 2px;cursor:pointer;opacity:0.6;"

function MeterCard(props: {
  label: string
  hint: string
  rule: string
  meter?: Meter
  points: number[]
  trend: string
  last?: boolean
}) {
  const percent = () => clamp(props.meter?.percent)
  const remaining = () => 100 - percent()
  const color = () => tone(percent())
  const reset = () => {
    const value = formatCountdown(props.meter?.resetsAt)
    return value === "即将重置" ? value : `${value}后`
  }

  return (
    <div
      style={`padding:16px 16px 14px;border-right:${props.last ? "none" : "1px solid rgba(127,127,127,0.12)"};display:flex;flex-direction:column;gap:10px;min-width:0;`}
    >
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
        <span style="font-size:12px;font-weight:500;">{props.label}</span>
        <span style={`font-family:${MONO};font-size:9px;opacity:0.35;`}>{props.hint}</span>
      </div>

      <div style="display:flex;align-items:baseline;gap:3px;">
        <span style={`font-family:${MONO};font-size:36px;font-weight:600;line-height:1;letter-spacing:-0.04em;color:${color()};font-variant-numeric:tabular-nums;`}>
          {percent().toFixed(0)}
        </span>
        <span style={`font-family:${MONO};font-size:13px;color:${color()};opacity:0.7;`}>%</span>
        <span style={`margin-left:auto;font-family:${MONO};font-size:10px;opacity:0.38;`}>
          剩余 {remaining().toFixed(0)}%
        </span>
      </div>

      <div style="position:relative;height:2px;background:rgba(127,127,127,0.16);">
        <div
          style={`height:100%;width:${percent()}%;background:${color()};transition:width 0.3s ease;`}
        />
        <div style="position:absolute;top:-3px;bottom:-3px;left:90%;width:1px;background:rgba(217,83,79,0.55);" />
      </div>

      <Sparkline points={props.points} height={30} color={color()} />

      <div style={`display:flex;justify-content:space-between;gap:8px;font-family:${MONO};font-size:9px;opacity:0.38;`}>
        <span>{props.trend}</span>
        <span title={formatReset(props.meter?.resetsAt)}>{reset()}</span>
      </div>
      <div style="font-size:9px;opacity:0.28;">{props.rule}</div>
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
  currentProject: Accessor<string | undefined>
  onRefresh: () => void
  onOpenConsole: () => void
  onOpenDocs: () => void
  onCopy: () => void
}) {
  const connected = () => props.usage()?.connected === true
  const catalog = createMemo(() => new Map(props.models().map((model) => [model.id, model])))
  const estimated = () => {
    const today = props.stats()?.today
    if (!today) return 0
    return today.models
      .filter((item) => item.model.providerID === "opencode-go")
      .reduce((sum, item) => sum + (estimateCost(catalog().get(item.model.id), item.tokens) ?? 0), 0)
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

  return (
    <div style="padding:24px;max-width:920px;display:flex;flex-direction:column;gap:18px;">
      <div style="display:flex;flex-direction:column;gap:12px;border-bottom:1px solid rgba(127,127,127,0.14);padding-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-size:19px;font-weight:650;letter-spacing:-0.01em;">OpenCode Go 用量</div>
            <div style="font-size:11px;opacity:0.42;margin-top:4px;">
              官方额度叠加本机统计，每 {Math.round(props.prefs.value.interval / 1000)} 秒刷新
            </div>
          </div>
          <div style={`display:flex;align-items:center;gap:6px;font-family:${MONO};font-size:10px;opacity:0.55;`}>
            <span style={`width:5px;height:5px;border-radius:999px;background:${connected() ? "#2f9e6e" : "#c94f4f"};`} />
            {connected() ? "OpenCode Go 已连接" : "未连接 OpenCode Go"}
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <button type="button" onClick={props.onRefresh} disabled={props.loading()} style={`${PRIMARY}opacity:${props.loading() ? "0.55" : "1"};`}>
            {props.loading() ? "刷新中" : "刷新"}
          </button>

          <div style={`display:flex;align-items:center;gap:1px;font-family:${MONO};font-size:10px;`}>
            <span style="opacity:0.3;margin-right:5px;">频率</span>
            <For each={[10_000, 30_000, 60_000]}>
              {(value) => (
                <button
                  type="button"
                  onClick={() => props.prefs.update((draft) => { draft.interval = value })}
                  style={`border:none;border-bottom:1px solid ${props.prefs.value.interval === value ? "currentColor" : "transparent"};background:transparent;color:inherit;font-family:inherit;font-size:10px;padding:0 4px 2px;cursor:pointer;opacity:${props.prefs.value.interval === value ? "1" : "0.35"};`}
                >
                  {value / 1000}s
                </button>
              )}
            </For>
          </div>

          <select
            value={props.prefs.value.scope}
            onChange={(event) => {
              const value = event.currentTarget.value as Prefs["scope"]
              props.prefs.update((draft) => { draft.scope = value })
            }}
            style={SELECT}
            disabled={!props.currentProject()}
            title="本地统计（今日、趋势、按模型）的范围；官方额度始终是整个账号的"
          >
            <option value="all">统计：全部项目</option>
            <option value="current">统计：当前项目</option>
          </select>

          <button type="button" onClick={props.onCopy} style={LINK}>
            复制摘要
          </button>
          <button type="button" onClick={props.onOpenConsole} style={LINK}>
            打开 Console
          </button>
        </div>
      </div>

      <Show when={props.error()}>
        <div style="border-left:2px solid #c94f4f;padding:4px 0 4px 10px;font-size:12px;color:#c94f4f;line-height:1.6;">
          {props.error()}
        </div>
      </Show>

      <Show when={props.usage() && !connected() && props.usage()?.error}>
        <div style="border-left:2px solid rgba(127,127,127,0.3);padding:4px 0 4px 10px;font-size:12px;line-height:1.7;">
          {props.usage()?.error}
          <div style="margin-top:4px;font-size:11px;opacity:0.5;">
            在 OpenCode 中运行 /connect，选择 OpenCode Go 并填入 API key 后即可显示额度。
          </div>
        </div>
      </Show>

      <Show when={connected()}>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid rgba(127,127,127,0.14);border-bottom:1px solid rgba(127,127,127,0.14);">
          <MeterCard
            label="5 小时窗口"
            hint="滚动"
            rule="月度额度的 20%"
            meter={props.usage()?.rolling}
            points={points("rolling")}
            trend={trend("rolling")}
          />
          <MeterCard
            label="本周"
            hint="每周"
            rule="月度额度的 50%"
            meter={props.usage()?.weekly}
            points={points("weekly")}
            trend={trend("weekly")}
          />
          <MeterCard
            label="本月"
            hint="每月"
            rule="月度额度的 100%"
            meter={props.usage()?.monthly}
            points={points("monthly")}
            trend={trend("monthly")}
            last
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
        <div style="font-size:11px;color:#c94f4f;opacity:0.85;">{props.statsError()}</div>
      </Show>
      <Show when={props.modelsError()}>
        <div style="font-size:11px;color:#c94f4f;opacity:0.85;">{props.modelsError()}</div>
      </Show>

      <ConsoleSection limits={props.limits} onOpenConsole={props.onOpenConsole} />
      <DataNotes onOpenDocs={props.onOpenDocs} />
    </div>
  )
}
