import { Show, createMemo, type Accessor } from "solid-js"
import type { GoModel, Meter, UsageSnapshot } from "../rpc.ts"
import type { ConsoleLimits, Prefs, StatsBundle } from "./types"
import { Sparkline } from "./charts"
import { estimateCost } from "./model-table"
import { ConsoleSection, DataNotes, HealthSection, ModelSection, TodaySection, TrendSection } from "./sections"
import {
  clamp,
  formatReset,
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
}) {
  const percent = () => clamp(props.meter?.percent)
  const remaining = () => 100 - percent()

  return (
    <div style="border:1px solid rgba(127,127,127,0.2);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-width:0;">
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

      <div style="font-size:10px;opacity:0.5;">
        {formatReset(props.meter?.resetsAt)} 重置
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

  const buttonStyle = "padding:6px 12px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;cursor:pointer;"
  const selectStyle = "padding:5px 8px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;"

  return (
    <div style="padding:24px;max-width:900px;display:flex;flex-direction:column;gap:20px;">
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-size:20px;font-weight:650;">OpenCode Go 用量</div>
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

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button type="button" onClick={props.onRefresh} disabled={props.loading()} style={`${buttonStyle}opacity:${props.loading() ? "0.5" : "1"};`}>
            {props.loading() ? "刷新中…" : "刷新"}
          </button>
          <select
            value={String(props.prefs.value.interval)}
            onChange={(event) => {
              const value = Number(event.currentTarget.value)
              props.prefs.update((draft) => { draft.interval = value })
            }}
            style={selectStyle}
          >
            <option value="10000">10 秒</option>
            <option value="30000">30 秒</option>
            <option value="60000">60 秒</option>
          </select>
          <label
            style="display:flex;align-items:center;gap:6px;font-size:11px;opacity:0.7;"
            title="本地统计（今日、趋势、按模型）的范围；官方额度始终是整个账号的"
          >
            统计范围
            <select
              value={props.prefs.value.scope}
              onChange={(event) => {
                const value = event.currentTarget.value as Prefs["scope"]
                props.prefs.update((draft) => { draft.scope = value })
              }}
              style={selectStyle}
              disabled={!props.currentProject()}
              title={props.currentProject() ? undefined : "当前没有打开的项目会话"}
            >
              <option value="all">全部项目</option>
              <option value="current">当前项目</option>
            </select>
          </label>
          <button type="button" onClick={props.onCopy} style={buttonStyle}>
            复制摘要
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
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
          <MeterCard
            label="5 小时窗口"
            hint="滚动窗口"
            rule="官方：月度额度的 20%"
            meter={props.usage()?.rolling}
            points={points("rolling")}
            trend={trend("rolling")}
          />
          <MeterCard
            label="本周"
            hint="每周额度"
            rule="官方：月度额度的 50%"
            meter={props.usage()?.weekly}
            points={points("weekly")}
            trend={trend("weekly")}
          />
          <MeterCard
            label="本月"
            hint="每月额度"
            rule="官方：100%"
            meter={props.usage()?.monthly}
            points={points("monthly")}
            trend={trend("monthly")}
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

      <DataNotes onOpenDocs={props.onOpenDocs} />
    </div>
  )
}
