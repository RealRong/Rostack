import type {
  DataDoc,
  DataRecord,
  EntityTable,
  RecordId
} from '@dataview/core/contracts/state'
import { entityTable as sharedEntityTable } from '@shared/core'

const replace = <TKey extends 'fields' | 'records' | 'views'>(
  document: DataDoc,
  key: TKey,
  table: DataDoc[TKey]
): DataDoc => {
  if (document[key] === table) {
    return document
  }

  return {
    ...document,
    [key]: table
  }
}

const normalizeRecords = (
  records: readonly DataRecord[]
): EntityTable<RecordId, DataRecord> => sharedEntityTable.normalize.list(records)

export const entityTable = {
  replace,
  access: sharedEntityTable.access,
  clone: {
    ...sharedEntityTable.clone,
    record: sharedEntityTable.clone.entity
  },
  normalize: {
    ...sharedEntityTable.normalize,
    records: normalizeRecords
  },
  read: sharedEntityTable.read,
  write: sharedEntityTable.write,
  patch: sharedEntityTable.patch,
  overlay: sharedEntityTable.overlay
} as const
