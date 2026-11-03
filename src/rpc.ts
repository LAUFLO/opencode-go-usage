import { Rpc } from "@opencode/plugin/rpc"

export type Meter = {
  percent: number
  limited: boolean
  resetsAt: number
}

export type Sample = {
  at: number
  rolling: number
  weekly: number
  monthly: number
}

export type UsageSnapshot = {
  connected: boolean
  error?: string
  fetchedAt?: number
  latencyMs?: number
  rolling?: Meter
  weekly?: Meter
  monthly?: Meter
  history: Sample[]
}

export type PriceTier = {
  contextGt: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type PeakPrice = {
  factor: number
  utcDays?: number[]
  windows: { start: string; end: string }[]
}

export type GoModel = {
  id: string
  name: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  context: number
  outputLimit: number
  tiers: PriceTier[]
  peak?: PeakPrice
  free: boolean
}

export type GoModels = {
  fetchedAt: number
  models: GoModel[]
  error?: string
}

const MeterSchema = {
  type: "object",
  properties: {
    percent: { type: "number" },
    limited: { type: "boolean" },
    resetsAt: { type: "number" },
  },
  required: ["percent", "limited", "resetsAt"],
  additionalProperties: false,
}

const SampleSchema = {
  type: "object",
  properties: {
    at: { type: "number" },
    rolling: { type: "number" },
    weekly: { type: "number" },
    monthly: { type: "number" },
  },
  required: ["at", "rolling", "weekly", "monthly"],
  additionalProperties: false,
}

const TierSchema = {
  type: "object",
  properties: {
    contextGt: { type: "number" },
    input: { type: "number" },
    output: { type: "number" },
    cacheRead: { type: "number" },
    cacheWrite: { type: "number" },
  },
  required: ["contextGt", "input", "output", "cacheRead", "cacheWrite"],
  additionalProperties: false,
}

const PeakSchema = {
  type: "object",
  properties: {
    factor: { type: "number" },
    utcDays: { type: "array", items: { type: "number" } },
    windows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "string" },
          end: { type: "string" },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  required: ["factor", "windows"],
  additionalProperties: false,
}

const ModelSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    input: { type: "number" },
    output: { type: "number" },
    cacheRead: { type: "number" },
    cacheWrite: { type: "number" },
    context: { type: "number" },
    outputLimit: { type: "number" },
    tiers: { type: "array", items: TierSchema },
    peak: PeakSchema,
    free: { type: "boolean" },
  },
  required: ["id", "name", "input", "output", "cacheRead", "cacheWrite", "context", "outputLimit", "tiers", "free"],
  additionalProperties: false,
}

export const GoUsage = Rpc.define({
  id: "opencode-go-usage",
  methods: {
    get: {
      input: {
        type: "object",
        properties: {
          refresh: { type: "boolean" },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          connected: { type: "boolean" },
          error: { type: "string" },
          fetchedAt: { type: "number" },
          latencyMs: { type: "number" },
          rolling: MeterSchema,
          weekly: MeterSchema,
          monthly: MeterSchema,
          history: { type: "array", items: SampleSchema },
        },
        required: ["connected", "history"],
        additionalProperties: false,
      },
    },
    models: {
      input: {
        type: "object",
        properties: {
          refresh: { type: "boolean" },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          fetchedAt: { type: "number" },
          models: { type: "array", items: ModelSchema },
          error: { type: "string" },
        },
        required: ["fetchedAt", "models"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
