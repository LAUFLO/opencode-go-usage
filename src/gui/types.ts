export type StatsTokens = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export type ModelUsage = {
  model: { id: string; providerID: string; variant?: string }
  steps: number
  tokens: StatsTokens
  cost: number
}

export type SessionStats = {
  range: { from: number; to: number }
  sessions: number
  subagents: number
  prompts: number
  steps: number
  tokens: StatsTokens
  cost: number
  tools: {
    mode: string
    totals?: { calls: number; succeeded: number; failed: number; unfinished: number }
  }
  activeDays: number
  streak: number
  activity: { date: string; steps: number }[]
  models: ModelUsage[]
}

export type StatsDay = {
  date: string
  stats: SessionStats
}

export type StatsBundle = {
  today: SessionStats
  yesterday?: SessionStats
  week: SessionStats
  month: SessionStats
  days: StatsDay[]
}

export type ConsoleBudget = {
  id: string
  limit: number
  spent: number
  scope: string
  per: string
  coverage: string
  resetsAt: number
}

export type ConsoleLimits = {
  workspace: { id: string; name?: string; usageURL?: string }
  budgets: ConsoleBudget[]
} | null

export type Prefs = {
  interval: number
  scope: "all" | "current"
  modelScope: "go" | "all"
  modelRange: "week" | "month"
  showCost: boolean
}
