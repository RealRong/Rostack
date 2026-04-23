import type { CommitSummary, CustomFieldId, DataDoc, RecordId, ViewId } from '@dataview/core/contracts'
import type { EngineDelta } from '@dataview/engine/contracts/delta'
import type { ViewState } from '@dataview/engine/contracts/view'
import type { ValidationIssue } from '@dataview/engine/mutate/issues'

export interface EngineSnapshot {
  doc: DataDoc
  active?: ViewState
}

export interface EngineResult {
  rev: number
  snapshot: EngineSnapshot
  delta?: EngineDelta
}

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
