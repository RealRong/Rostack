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
  createStaticDocumentReadContext
} from '@dataview/engine/document/reader'
import type {
  IndexDeriveContext,
  IndexReadContext
} from '@dataview/engine/active/index/contracts'

export const createIndexReadContext = (
  document: DataDoc
): IndexReadContext => {
  const context = createStaticDocumentReadContext(document)

  return {
    document: context.document,
    reader: context.reader,
    fieldIds: context.fieldIds,
    fieldIdSet: context.fieldIdSet
  }
}

export const createIndexDeriveContext = (
  document: DataDoc,
  impact: CommitImpact
): IndexDeriveContext => ({
  ...createIndexReadContext(document),
  impact,
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
