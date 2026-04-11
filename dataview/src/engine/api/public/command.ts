import type {
  CommitDelta,
  CustomFieldId,
  DataDoc,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type { ValidationIssue } from '@dataview/engine/command'
import type { HistoryOptions } from '../../history'
import type { EnginePerfOptions } from './perf'

export interface CreateEngineOptions {
  document: DataDoc
  history?: HistoryOptions
  perf?: EnginePerfOptions
}

export interface CommitResult {
  issues: ValidationIssue[]
  applied: boolean
  changes?: CommitDelta
}

export interface CreatedEntities {
  records?: readonly RecordId[]
  fields?: readonly CustomFieldId[]
  views?: readonly ViewId[]
}

export interface ActionResult extends CommitResult {
  created?: CreatedEntities
}

export interface HistoryActionResult extends CommitResult {}
