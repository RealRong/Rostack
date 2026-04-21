import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  FieldId,
  RecordId
} from '@dataview/core/contracts'

export interface BaseImpact {
  commit: CommitImpact
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  recordSetChanged: boolean
}

export const createBaseImpact = (
  commit: CommitImpact
): BaseImpact => ({
  commit,
  touchedRecords: commitImpact.record.touchedIds(commit),
  touchedFields: commitImpact.field.touchedIds(commit, {
    includeTitlePatch: true
  }),
  valueFields: commitImpact.field.valueIds(commit, {
    includeTitlePatch: true
  }),
  schemaFields: commitImpact.field.schemaIds(commit),
  recordSetChanged: commitImpact.has.recordSetChange(commit)
})
