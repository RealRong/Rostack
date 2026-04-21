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
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'

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
  impact: BaseImpact
): IndexDeriveContext => ({
  ...createIndexReadContext(document),
  schemaFields: impact.schemaFields,
  valueFields: impact.valueFields,
  touchedFields: impact.touchedFields,
  touchedRecords: impact.touchedRecords,
  recordSetChanged: impact.recordSetChanged,
  changed: Boolean(
    impact.commit.reset
    || impact.commit.records
    || impact.commit.fields?.schema
  )
})
