import { Rpc } from "@opencode/plugin/rpc"

export type Meter = {
  percent: number
  limited: boolean
  resetsAt: number
}

export type UsageSnapshot = {
  connected: boolean
  error?: string
  fetchedAt?: number
  rolling?: Meter
  weekly?: Meter
  monthly?: Meter
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
          rolling: MeterSchema,
          weekly: MeterSchema,
          monthly: MeterSchema,
        },
        required: ["connected"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
