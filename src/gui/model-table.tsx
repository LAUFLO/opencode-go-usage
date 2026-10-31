import { For, Show, createMemo, type Accessor } from "solid-js"
import type { GoModel } from "../rpc.ts"
import type { ModelUsage, SessionStats } from "./types"
import { formatMoney, formatNumber, formatTokens } from "./format"

export function estimateCost(model: GoModel | undefined, tokens: ModelUsage["tokens"]) {
  if (!model) return undefined
  const output = tokens.output + tokens.reasoning
  return (
    (tokens.input * model.input +
      output * model.output +
      tokens.cache.read * model.cacheRead +
      tokens.cache.write * model.cacheWrite) /
    1_000_000
  )
}

export function ModelTable(props: {
  stats: Accessor<SessionStats | undefined>
  models: Accessor<GoModel[]>
  scope: Accessor<"go" | "all">
  showCost: Accessor<boolean>
}) {
  const catalog = createMemo(() => new Map(props.models().map((model) => [model.id, model])))

  const rows = createMemo(() => {
    const stats = props.stats()
    if (!stats) return []
    const filtered =
      props.scope() === "go"
        ? stats.models.filter((item) => item.model.providerID === "opencode-go")
        : stats.models
    return filtered
      .map((usage) => {
        const model = catalog().get(usage.model.id)
        return { usage, model, cost: estimateCost(model, usage.tokens) }
      })
      .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.usage.steps - a.usage.steps)
  })

  const total = createMemo(() =>
    rows().reduce((sum, row) => sum + (row.cost ?? 0), 0),
  )

  return (
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="font-size:11px;opacity:0.55;">
          {props.scope() === "go" ? "OpenCode Go 模型" : "全部模型"} · 共 {rows().length} 个
        </div>
        <Show when={props.showCost()}>
          <div style="font-size:11px;opacity:0.65;">
            估算合计 <strong style="font-weight:600;">{formatMoney(total())}</strong>
            <span style="opacity:0.5;">（按公开基础价，未计高峰倍率）</span>
          </div>
        </Show>
      </div>

      <Show
        when={rows().length > 0}
        fallback={<div style="font-size:12px;opacity:0.5;padding:12px 0;">这个时间范围内还没有模型调用记录。</div>}
      >
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px;">
            <thead>
              <tr style="text-align:left;opacity:0.55;font-size:11px;">
                <th style="padding:6px 8px 6px 0;font-weight:500;">模型</th>
                <th style="padding:6px 8px;font-weight:500;text-align:right;">请求</th>
                <th style="padding:6px 8px;font-weight:500;text-align:right;">输入</th>
                <th style="padding:6px 8px;font-weight:500;text-align:right;">输出</th>
                <th style="padding:6px 8px;font-weight:500;text-align:right;">缓存读取</th>
                <Show when={props.showCost()}>
                  <th style="padding:6px 0 6px 8px;font-weight:500;text-align:right;">估算</th>
                </Show>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr style="border-top:1px solid rgba(127,127,127,0.15);">
                    <td style="padding:8px 8px 8px 0;max-width:220px;">
                      <div style="display:flex;flex-direction:column;gap:2px;">
                        <span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          {row.model?.name ?? row.usage.model.id}
                        </span>
                        <span style="font-size:10px;opacity:0.45;">
                          {row.usage.model.providerID}
                          {row.usage.model.variant ? ` · ${row.usage.model.variant}` : ""}
                        </span>
                      </div>
                    </td>
                    <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;">
                      {formatNumber(row.usage.steps)}
                    </td>
                    <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;">
                      {formatTokens(row.usage.tokens.input)}
                    </td>
                    <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;">
                      {formatTokens(row.usage.tokens.output)}
                    </td>
                    <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums;">
                      {formatTokens(row.usage.tokens.cache.read)}
                    </td>
                    <Show when={props.showCost()}>
                      <td style="padding:8px 0 8px 8px;text-align:right;font-variant-numeric:tabular-nums;">
                        {row.cost === undefined ? "—" : `≈ ${formatMoney(row.cost)}`}
                      </td>
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  )
}
