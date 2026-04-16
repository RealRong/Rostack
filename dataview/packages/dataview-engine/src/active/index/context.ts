import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  createStaticDocumentReadContext
} from '@dataview/engine/document/reader'
import type {
  IndexDeriveContext,
  IndexReadContext
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'

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
  impact: ActiveImpact
): IndexDeriveContext => ({
  ...createIndexReadContext(document),
  schemaFields: impact.base.schemaFields,
  valueFields: impact.base.valueFields,
  touchedFields: impact.base.touchedFields,
  touchedRecords: impact.base.touchedRecords,
  recordSetChanged: impact.base.recordSetChanged,
  changed: Boolean(
    impact.commit.reset
    || impact.commit.records
    || impact.commit.fields?.schema
  )
})
