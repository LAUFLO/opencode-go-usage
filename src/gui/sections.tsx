import { For, Show, type Accessor } from "solid-js"
import type { GoModel } from "../rpc.ts"
import type { ConsoleBudget, ConsoleLimits, Prefs, StatsBundle, SessionStats } from "./types"
import { BarChart, Section, StatTile } from "./charts"
import { ModelTable } from "./model-table"
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatReset,
  formatTokens,
  sumTokens,
} from "./format"

type PrefsStore = {
  readonly value: Prefs
  update(mutate: (draft: Prefs) => void): void
}

function labelFromKey(key: string) {
  const parts = key.split("-")
  if (parts.length < 3) return key
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function toggleStyle(active: boolean) {
  return `padding:4px 10px;border-radius:6px;border:1px solid rgba(127,127,127,0.28);background:${active ? "rgba(127,127,127,0.16)" : "transparent"};color:inherit;font-size:11px;cursor:pointer;`
}

export function TrendSection(props: { stats: Accessor<StatsBundle | undefined> }) {
  const days = () => props.stats()?.days ?? []
  const steps = () =>
    days().map((day) => ({
      label: labelFromKey(day.date),
      value: day.stats.steps,
      hint: `${formatNumber(day.stats.steps)} steps`,
    }))
  const tokens = () =>
    days().map((day) => ({
      label: labelFromKey(day.date),
      value: sumTokens(day.stats.tokens),
      hint: `${formatTokens(sumTokens(day.stats.tokens))} tokens`,
    }))
  const monthSteps = () =>
    (props.stats()?.month.activity ?? []).slice(-30).map((item, index) => ({
      label: index % 5 === 0 ? labelFromKey(item.date) : "",
      value: item.steps,
      hint: `${item.date}: ${formatNumber(item.steps)} steps`,
    }))

  return (
    <Section title="使用趋势" hint="本机 OpenCode 统计">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
        <div style="border:1px solid rgba(127,127,127,0.18);border-radius:10px;padding:12px 14px;">
          <div style="font-size:11px;opacity:0.55;margin-bottom:8px;">近 7 天 · Steps</div>
          <BarChart data={steps()} height={110} color="#3b82f6" />
        </div>
        <div style="border:1px solid rgba(127,127,127,0.18);border-radius:10px;padding:12px 14px;">
          <div style="font-size:11px;opacity:0.55;margin-bottom:8px;">近 7 天 · Tokens</div>
          <BarChart data={tokens()} height={110} color="#8b5cf6" />
        </div>
      </div>
      <div style="border:1px solid rgba(127,127,127,0.18);border-radius:10px;padding:12px 14px;">
        <div style="font-size:11px;opacity:0.55;margin-bottom:8px;">近 30 天 · Steps</div>
        <BarChart data={monthSteps()} height={100} color="#14b8a6" />
      </div>
    </Section>
  )
}

export function ModelSection(props: {
  stats: Accessor<StatsBundle | undefined>
  models: Accessor<GoModel[]>
  prefs: PrefsStore
}) {
  const current = () =>
    props.prefs.value.modelRange === "week" ? props.stats()?.week : props.stats()?.month

  return (
    <Section
      title="按模型用量"
      hint="本机统计 + 估算金额"
      actions={
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button
            type="button"
            style={toggleStyle(props.prefs.value.modelRange === "week")}
            onClick={() => props.prefs.update((draft) => { draft.modelRange = "week" })}
          >
            本周
          </button>
          <button
            type="button"
            style={toggleStyle(props.prefs.value.modelRange === "month")}
            onClick={() => props.prefs.update((draft) => { draft.modelRange = "month" })}
          >
            本月
          </button>
          <button
            type="button"
            style={toggleStyle(props.prefs.value.modelScope === "go")}
            onClick={() => props.prefs.update((draft) => { draft.modelScope = "go" })}
          >
            仅 Go 模型
          </button>
          <button
            type="button"
            style={toggleStyle(props.prefs.value.modelScope === "all")}
            onClick={() => props.prefs.update((draft) => { draft.modelScope = "all" })}
          >
            全部模型
          </button>
          <button
            type="button"
            style={toggleStyle(props.prefs.value.showCost)}
            onClick={() => props.prefs.update((draft) => { draft.showCost = !draft.showCost })}
          >
            {props.prefs.value.showCost ? "隐藏金额" : "显示金额"}
          </button>
        </div>
      }
    >
      <ModelTable
        stats={current}
        models={props.models}
        scope={() => props.prefs.value.modelScope}
        showCost={() => props.prefs.value.showCost}
      />
    </Section>
  )
}

export function HealthSection(props: { stats: Accessor<StatsBundle | undefined> }) {
  const month = () => props.stats()?.month
  const tools = () => month()?.tools.totals
  const rate = () => {
    const value = tools()
    if (!value || value.calls === 0) return undefined
    return (value.succeeded / value.calls) * 100
  }

  return (
    <Section title="工具与会话" hint="本机 OpenCode 统计">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
        <StatTile
          label="工具成功率"
          value={rate() === undefined ? "—" : `${rate()!.toFixed(1)}%`}
          hint={tools() ? `${formatNumber(tools()!.succeeded)} / ${formatNumber(tools()!.calls)} 次` : "暂无工具调用"}
          tone={rate() !== undefined && rate()! < 90 ? "#f59e0b" : undefined}
        />
        <StatTile
          label="失败 / 未完成"
          value={tools() ? `${formatNumber(tools()!.failed)} / ${formatNumber(tools()!.unfinished)}` : "—"}
          hint="本月工具调用"
        />
        <StatTile label="活跃天数" value={`${formatNumber(month()?.activeDays)} 天`} hint="本月有使用的天数" />
        <StatTile label="连续使用" value={`${formatNumber(month()?.streak)} 天`} hint="当前连续天数" />
        <StatTile label="会话 / 子代理" value={`${formatNumber(month()?.sessions)} / ${formatNumber(month()?.subagents)}`} hint="本月" />
        <StatTile label="Prompts" value={formatNumber(month()?.prompts)} hint="本月提交的提示" />
      </div>
    </Section>
  )
}

function budgetLabel(budget: ConsoleBudget) {
  if (budget.coverage === "all") return "全部模型与服务"
  if (budget.per === "model") return "按模型预算"
  if (budget.scope === "combined") return "工作区共享预算"
  return "个人预算"
}

export function ConsoleSection(props: {
  limits: Accessor<ConsoleLimits | undefined>
  onOpenConsole: () => void
}) {
  const budgets = () => props.limits()?.budgets ?? []
  return (
    <Show when={props.limits() && budgets().length > 0}>
      <Section
        title="Console 预算"
        hint={props.limits()?.workspace.name ?? "OpenCode Console"}
        actions={
          <button
            type="button"
            onClick={props.onOpenConsole}
            style="padding:4px 10px;border-radius:6px;border:1px solid rgba(127,127,127,0.28);background:transparent;color:inherit;font-size:11px;cursor:pointer;"
          >
            打开 Console
          </button>
        }
      >
        <div style="display:flex;flex-direction:column;gap:10px;">
          <For each={budgets()}>
            {(budget) => {
              const used = () => (budget.limit > 0 ? Math.min(100, (budget.spent / budget.limit) * 100) : 100)
              return (
                <div style="border:1px solid rgba(127,127,127,0.18);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;">
                  <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
                    <span style="font-size:12px;font-weight:500;">{budgetLabel(budget)}</span>
                    <span style="font-size:12px;font-variant-numeric:tabular-nums;">
                      {formatMoney(budget.spent)} / {formatMoney(budget.limit)}
                    </span>
                  </div>
                  <div style="height:6px;border-radius:999px;background:rgba(127,127,127,0.2);overflow:hidden;">
                    <div
                      style={`height:100%;width:${used()}%;border-radius:999px;background:${used() >= 90 ? "#ef4444" : used() >= 70 ? "#f59e0b" : "#22c55e"};transition:width .3s ease;`}
                    />
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:10px;opacity:0.55;gap:12px;flex-wrap:wrap;">
                    <span>剩余 {formatMoney(Math.max(0, budget.limit - budget.spent))}</span>
                    <span>{formatReset(budget.resetsAt)} 重置</span>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </Section>
    </Show>
  )
}

export function TodaySection(props: {
  stats: Accessor<StatsBundle | undefined>
  models: Accessor<GoModel[]>
  showCost: Accessor<boolean>
  estimated: Accessor<number>
}) {
  const today = () => props.stats()?.today
  const go = () => today()?.models.filter((item) => item.model.providerID === "opencode-go") ?? []
  const goSteps = () => go().reduce((sum, item) => sum + item.steps, 0)
  const tokens = () => sumTokens(today()?.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
  const yesterdayTokens = () =>
    sumTokens(props.stats()?.yesterday?.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
  const delta = () => {
    if (!props.stats()?.yesterday || yesterdayTokens() <= 0) return undefined
    return ((tokens() - yesterdayTokens()) / yesterdayTokens()) * 100
  }

  return (
    <Section title="今日概览" hint="本机 OpenCode 统计">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
        <StatTile label="Steps" value={formatNumber(today()?.steps)} hint="今日模型步数" />
        <StatTile label="Prompts" value={formatNumber(today()?.prompts)} hint="今日提交" />
        <StatTile label="会话" value={formatNumber(today()?.sessions)} hint={`子代理 ${formatNumber(today()?.subagents)}`} />
        <StatTile
          label="Tokens"
          value={formatTokens(tokens())}
          hint={delta() === undefined ? "含缓存读取" : `较昨日 ${delta()! >= 0 ? "+" : ""}${delta()!.toFixed(0)}%`}
        />
        <StatTile label="Go 请求" value={formatNumber(goSteps())} hint="今日 opencode-go 模型步数" />
        <Show when={props.showCost()}>
          <StatTile label="估算消耗" value={formatMoney(props.estimated())} hint="按公开基础价估算" />
        </Show>
        <StatTile label="缓存读取" value={formatTokens(today()?.tokens.cache.read)} hint="今日缓存命中" />
        <StatTile label="工具调用" value={formatNumber(today()?.tools.totals?.calls)} hint="今日" />
      </div>
    </Section>
  )
}

export function DataNotes(props: { onOpenDocs: () => void }) {
  return (
    <div style="border-top:1px solid rgba(127,127,127,0.15);padding-top:12px;display:flex;flex-direction:column;gap:6px;font-size:10px;line-height:1.6;opacity:0.55;">
      <div>
        额度百分比来自 OpenCode Go 官方接口；今日、趋势、按模型数据来自本机 OpenCode
        会话统计，只包含这台机器，不含其他设备或其他客户端的使用。
      </div>
      <div>
        金额是按公开基础价估算的参考值，未计高峰倍率、长上下文阶梯价和 Console
        账单调整，不能替代官方账单。
      </div>
      <button
        type="button"
        onClick={props.onOpenDocs}
        style="align-self:flex-start;padding:0;border:none;background:transparent;color:inherit;font-size:10px;text-decoration:underline;cursor:pointer;opacity:0.8;"
      >
        查看官方 Go 用量与限额说明
      </button>
    </div>
  )
}
