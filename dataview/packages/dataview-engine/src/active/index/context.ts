import {
  collectSchemaFieldIds,
  collectTouchedFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  hasRecordSetChange
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  DataDoc
} from '@dataview/core/contracts'
import {
  createStaticDocumentReader
} from '@dataview/engine/document/reader'
import type {
  IndexDeriveContext,
  IndexImpactView,
  IndexReadContext
} from '@dataview/engine/active/index/contracts'

const createIndexImpactView = (
  impact: CommitImpact
): IndexImpactView => ({
  schemaFields: collectSchemaFieldIds(impact),
  valueFields: collectValueFieldIds(impact, {
    includeTitlePatch: true
  }),
  touchedFields: collectTouchedFieldIds(impact, {
    includeTitlePatch: true
  }),
  touchedRecords: collectTouchedRecordIds(impact),
  recordSetChanged: hasRecordSetChange(impact),
  changed: Boolean(
    impact.reset
    || impact.records
    || impact.fields?.schema
  )
})

export const createIndexReadContext = (
  document: DataDoc
): IndexReadContext => {
  const reader = createStaticDocumentReader(document)
  const fieldIds = reader.fields.ids()

  return {
    document,
    reader,
    fieldIds,
    fieldIdSet: new Set(fieldIds)
  }
}

export const createIndexDeriveContext = (
  document: DataDoc,
  impact: CommitImpact
): IndexDeriveContext => ({
  ...createIndexReadContext(document),
  impact: createIndexImpactView(impact)
})
