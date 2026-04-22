import type { CommitSummary, CustomFieldId, RecordId, ViewId } from '@dataview/core/contracts'
import type { ValidationIssue } from '@dataview/engine/mutate/issues'

export interface CommitResult {
  issues: readonly ValidationIssue[]
  applied: boolean
  summary?: CommitSummary
}

export interface CreatedEntities {
  records?: readonly RecordId[]
  fields?: readonly CustomFieldId[]
  views?: readonly ViewId[]
}

export interface ActionResult extends CommitResult {
  created?: CreatedEntities
}
