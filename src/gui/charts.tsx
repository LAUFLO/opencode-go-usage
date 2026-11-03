import { For, Show, type JSX } from "solid-js"

export function Sparkline(props: {
  points: number[]
  height?: number
  color?: string
  max?: number
}) {
  const bounds = () => {
    if (props.max !== undefined) return { min: 0, max: Math.max(1, props.max) }
    const values = props.points
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(0.25, max - min)
    const center = (min + max) / 2
    return { min: Math.max(0, center - span / 2), max: center + span / 2 }
  }

  const coords = () => {
    const values = props.points
    if (values.length < 2) return ""
    const { min, max } = bounds()
    const span = Math.max(0.0001, max - min)
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 100
        const y = 95 - ((value - min) / span) * 90
        return `${x.toFixed(2)},${Math.max(2, Math.min(98, y)).toFixed(2)}`
      })
      .join(" ")
  }

  return (
    <Show
      when={props.points.length >= 2}
      fallback={<div style="height:48px;display:flex;align-items:center;font-size:11px;opacity:0.45;">采样中…</div>}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={`width:100%;height:${props.height ?? 48}px;display:block;overflow:visible;`}
      >
        <polygon points={`0,100 ${coords()} 100,100`} fill={props.color ?? "#22c55e"} opacity="0.12" />
        <polyline
          points={coords()}
          fill="none"
          stroke={props.color ?? "#22c55e"}
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    </Show>
  )
}

export function BarChart(props: {
  data: { label: string; value: number; hint?: string }[]
  height?: number
  color?: string
}) {
  const height = () => props.height ?? 120
  const max = () => Math.max(1, ...props.data.map((item) => item.value))
  const barHeight = (value: number) => Math.max(1, (value / max()) * (height() - 22))

  return (
    <div
      style={`display:flex;align-items:flex-end;gap:${props.data.length > 14 ? 2 : 6}px;height:${height()}px;padding-top:4px;`}
    >
      <For each={props.data}>
        {(item) => (
          <div
            title={`${item.label}: ${item.hint ?? String(item.value)}`}
            style="flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;"
          >
            <div
              style={`width:100%;max-width:34px;height:${barHeight(item.value)}px;background:${props.color ?? "#22c55e"};border-radius:4px 4px 2px 2px;opacity:${item.value === 0 ? 0.15 : 1};transition:height 0.3s ease;`}
            />
            <span style="height:14px;line-height:14px;font-size:9px;opacity:0.55;white-space:nowrap;overflow:hidden;">
              {item.label}
            </span>
          </div>
        )}
      </For>
    </div>
  )
}

export function StatTile(props: {
  label: string
  value: string
  hint?: string
  tone?: string
}) {
  return (
    <div style="border:1px solid rgba(127,127,127,0.18);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0;">
      <div style="font-size:11px;opacity:0.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        {props.label}
      </div>
      <div style={`font-size:20px;font-weight:600;line-height:1.2;color:${props.tone ?? "inherit"};`}>
        {props.value}
      </div>
      <Show when={props.hint}>
        <div style="font-size:10px;opacity:0.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          {props.hint}
        </div>
      </Show>
    </div>
  )
}

export function Section(props: {
  title: string
  hint?: string
  actions?: JSX.Element
  children: JSX.Element
}) {
  return (
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <span style="font-size:13px;font-weight:600;">{props.title}</span>
          <Show when={props.hint}>
            <span style="margin-left:8px;font-size:11px;opacity:0.5;">{props.hint}</span>
          </Show>
        </div>
        {props.actions}
      </div>
      {props.children}
    </div>
  )
}
