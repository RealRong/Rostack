import { impact } from './internal/impact'
import type { CommitImpact } from '@dataview/core/types/commit'

export type DataviewTrace = CommitImpact

export const dataviewTrace = {
  create: impact.create,
  reset: impact.reset,
  finalize: impact.finalize,
  summary: impact.summary,
  has: impact.has,
  record: impact.record,
  value: impact.value,
  field: impact.field,
  view: impact.view
} as const

export const trace = dataviewTrace
