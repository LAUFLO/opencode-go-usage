import { For, Show, createMemo, type Accessor } from "solid-js"
import type { GoModel } from "../rpc.ts"
import type { ModelUsage, SessionStats } from "./types"
import { formatMoney, formatNumber, formatTokens } from "./format"

export function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export function isPeak(peak: NonNullable<GoModel["peak"]>, at = Date.now()) {
  const date = new Date(at)
  if (peak.utcDays && peak.utcDays.length > 0 && !peak.utcDays.includes(date.getUTCDay())) return false

  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  return peak.windows.some((window) => {
    const start = toMinutes(window.start)
    const end = toMinutes(window.end)
    if (end >= start) return minutes >= start && minutes < end
    return minutes >= start || minutes < end
  })
}

export function isFree(model: GoModel | undefined) {
  if (!model) return false
  return model.free ?? (model.input === 0 && model.output === 0)
}

export function priceFor(model: GoModel | undefined, contextTokens = 0, at = Date.now()) {
  if (!model) return undefined

  let input = model.input
  let output = model.output
  let cacheRead = model.cacheRead
  let cacheWrite = model.cacheWrite

  const tier = [...(model.tiers ?? [])]
    .filter((item) => contextTokens > item.contextGt)
    .sort((a, b) => b.contextGt - a.contextGt)[0]
  if (tier) {
    input = tier.input
    output = tier.output
    cacheRead = tier.cacheRead
    cacheWrite = tier.cacheWrite
  }

  const peak = model.peak ? isPeak(model.peak, at) : false
  const factor = peak && model.peak ? model.peak.factor : 1

  return {
    input: input * factor,
    output: output * factor,
    cacheRead: cacheRead * factor,
    cacheWrite: cacheWrite * factor,
    peak,
    tier: tier?.contextGt,
  }
}

export function estimateCost(
  model: GoModel | undefined,
  tokens: ModelUsage["tokens"],
  contextTokens = 0,
  at = Date.now(),
) {
  const price = priceFor(model, contextTokens, at)
  if (!price) return undefined

  const output = tokens.output + tokens.reasoning
  return (
    (tokens.input * price.input +
      output * price.output +
      tokens.cache.read * price.cacheRead +
      tokens.cache.write * price.cacheWrite) /
    1_000_000
  )
}

/** Average context per request, used to pick the long-context price tier. */
export function averageContext(tokens: ModelUsage["tokens"], steps: number) {
  return Math.round((tokens.input + tokens.cache.read) / Math.max(1, steps))
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
        const context = averageContext(usage.tokens, usage.steps)
        return {
          usage,
          model,
          cost: estimateCost(model, usage.tokens, context),
          peak: model?.peak ? isPeak(model.peak) : false,
        }
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
            <span style="opacity:0.5;">（按官方价格表，含时段倍率与长上下文阶梯价）</span>
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
                        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                          <span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            {row.model?.name ?? row.usage.model.id}
                          </span>
                          <Show when={isFree(row.model)}>
                            <span style="flex-shrink:0;padding:0 5px;border-radius:4px;border:1px solid rgba(34,197,94,0.4);color:#22c55e;font-size:9px;line-height:14px;">
                              免费
                            </span>
                          </Show>
                          <Show when={row.peak}>
                            <span style="flex-shrink:0;padding:0 5px;border-radius:4px;border:1px solid rgba(245,158,11,0.4);color:#f59e0b;font-size:9px;line-height:14px;">
                              高峰 ×{row.model?.peak?.factor ?? 2}
                            </span>
                          </Show>
                        </div>
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
