import type { Accessor } from "solid-js"
import type { Meter, UsageSnapshot } from "../rpc.ts"

const OK = "#22c55e"
const WARN = "#f59e0b"
const DANGER = "#ef4444"

function tone(percent: number) {
  if (percent >= 90) return DANGER
  if (percent >= 70) return WARN
  return OK
}

function clamp(percent: number | undefined) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, percent))
}

function formatTime(timestamp: number | undefined) {
  if (!timestamp) return "未知"
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatReset(timestamp: number | undefined) {
  if (!timestamp) return "未知时间"
  const date = new Date(timestamp)
  const absolute = date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const diff = timestamp - Date.now()
  if (diff <= 0) return absolute
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${absolute}（${minutes} 分钟后）`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${absolute}（${hours} 小时后）`
  return `${absolute}（${Math.floor(hours / 24)} 天后）`
}

function MeterCard(props: { label: string; hint: string; meter?: Meter }) {
  const percent = () => clamp(props.meter?.percent)
  return (
    <div style="border:1px solid rgba(127,127,127,0.2);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:13px;font-weight:500;">{props.label}</span>
        <strong style={`font-size:18px;color:${tone(percent())};`}>{percent().toFixed(0)}%</strong>
      </div>
      <div style="height:8px;border-radius:999px;background:rgba(127,127,127,0.2);overflow:hidden;">
        <div
          style={`height:100%;width:${percent()}%;border-radius:999px;background:${tone(percent())};transition:width 0.3s ease;`}
        />
      </div>
      <div style="font-size:12px;opacity:0.6;">
        {props.meter?.limited
          ? "已触发限流，等待窗口重置。"
          : `${props.hint} · ${formatReset(props.meter?.resetsAt)} 重置`}
      </div>
    </div>
  )
}

function buttonStyle(disabled: boolean) {
  return `padding:6px 12px;border-radius:6px;border:1px solid rgba(127,127,127,0.35);background:transparent;color:inherit;cursor:${disabled ? "default" : "pointer"};font-size:13px;opacity:${disabled ? "0.5" : "1"};`
}

export function UsagePage(props: {
  value: Accessor<UsageSnapshot | undefined>
  loading: Accessor<boolean>
  error: Accessor<string | undefined>
  onRefresh: () => void
  onOpenConsole: () => void
}) {
  const message = () => props.error() ?? props.value()?.error
  const ready = () => props.value()?.connected === true && !message()
  const snapshot = () => props.value()

  return (
    <div style="padding:24px;max-width:600px;display:flex;flex-direction:column;gap:16px;">
      <div>
        <div style="font-size:18px;font-weight:600;">OpenCode Go 用量</div>
        <div style="margin-top:4px;font-size:12px;opacity:0.6;">
          数据来自 opencode.ai，每 60 秒自动刷新一次。
        </div>
      </div>

      {ready() ? (
        <>
          <MeterCard label="5 小时窗口" hint="滚动窗口" meter={snapshot()?.rolling} />
          <MeterCard label="本周" hint="每周额度" meter={snapshot()?.weekly} />
          <MeterCard label="本月" hint="每月额度" meter={snapshot()?.monthly} />
        </>
      ) : (
        <div style="border:1px solid rgba(127,127,127,0.2);border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.6;">
          {message() ?? "正在读取 OpenCode Go 用量…"}
          {props.value()?.connected === false ? (
            <div style="margin-top:6px;font-size:12px;opacity:0.65;">
              在 OpenCode 中运行 /connect，选择 OpenCode Go 并填入 API key 后即可显示额度。
            </div>
          ) : null}
        </div>
      )}

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" onClick={props.onRefresh} disabled={props.loading()} style={buttonStyle(props.loading())}>
          {props.loading() ? "刷新中…" : "刷新"}
        </button>
        <button type="button" onClick={props.onOpenConsole} style={buttonStyle(false)}>
          打开 OpenCode Console
        </button>
        <span style="font-size:12px;opacity:0.55;">更新于 {formatTime(snapshot()?.fetchedAt)}</span>
      </div>
    </div>
  )
}

export function UsageBadge(props: {
  value: Accessor<UsageSnapshot | undefined>
  onOpen: () => void
}) {
  const snapshot = () => props.value()
  return (
    <>
      {snapshot()?.connected ? (
        <button
          type="button"
          onClick={props.onOpen}
          title="查看 OpenCode Go 用量"
          style="display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:11px;cursor:pointer;white-space:nowrap;"
        >
          <span style="font-weight:600;">Go</span>
          <span style="opacity:0.6;">5h</span>
          <span style={`color:${tone(clamp(snapshot()?.rolling?.percent))};`}>
            {clamp(snapshot()?.rolling?.percent).toFixed(0)}%
          </span>
          <span style="opacity:0.35;">·</span>
          <span style="opacity:0.6;">周</span>
          <span style={`color:${tone(clamp(snapshot()?.weekly?.percent))};`}>
            {clamp(snapshot()?.weekly?.percent).toFixed(0)}%
          </span>
          <span style="opacity:0.35;">·</span>
          <span style="opacity:0.6;">月</span>
          <span style={`color:${tone(clamp(snapshot()?.monthly?.percent))};`}>
            {clamp(snapshot()?.monthly?.percent).toFixed(0)}%
          </span>
        </button>
      ) : null}
    </>
  )
}
