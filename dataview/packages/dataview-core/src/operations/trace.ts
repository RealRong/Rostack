import { impact } from './internal/impact'
import type { CommitImpact } from '@dataview/core/types/commit'
import {
  trace as sharedTrace
} from '@shared/trace'

export type DataviewTrace = CommitImpact

export const dataviewTraceSpec = {
  summary: {
    records: 'flag',
    fields: 'flag',
    views: 'flag',
    activeView: 'flag',
    external: 'flag',
    indexes: 'flag'
  },
  entities: {
    touchedRecordCount: 'count',
    touchedFieldCount: 'count',
    touchedViewCount: 'count'
  }
} as const

export const dataviewTrace = {
  create: impact.create,
  reset: impact.reset,
  finalize: impact.finalize,
  summary: impact.summary,
  has: impact.has,
  record: impact.record,
  value: impact.value,
  field: impact.field,
  view: impact.view,
  count: sharedTrace.count,
  hasCount: sharedTrace.has
} as const

export const trace = dataviewTrace
