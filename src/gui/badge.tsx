import type { Accessor } from "solid-js"
import type { UsageSnapshot } from "../rpc.ts"
import { clamp, tone } from "./format"

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
