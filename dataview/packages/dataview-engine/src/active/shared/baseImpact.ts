import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  DataviewTrace
} from '@dataview/core/mutation'

export interface BaseImpact {
  trace: DataviewTrace
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  recordSetChanged: boolean
}

export const createBaseImpact = (
  trace: DataviewTrace
): BaseImpact => ({
  trace,
  touchedRecords: dataviewTrace.record.touchedIds(trace),
  touchedFields: dataviewTrace.field.touchedIds(trace),
  valueFields: dataviewTrace.field.valueIds(trace),
  schemaFields: dataviewTrace.field.schemaIds(trace),
  recordSetChanged: dataviewTrace.has.recordSetChange(trace)
})
