import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import type {
  CommitImpact
} from '@dataview/core/types/commit'

export type DataviewTrace = CommitImpact

export const dataviewTrace = {
  create: commitImpact.create,
  reset: commitImpact.reset,
  finalize: commitImpact.finalize,
  summary: commitImpact.summary,
  has: commitImpact.has,
  record: commitImpact.record,
  value: commitImpact.value,
  field: commitImpact.field,
  view: commitImpact.view
} as const
