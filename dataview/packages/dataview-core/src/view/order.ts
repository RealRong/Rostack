import type {
  RecordId,
  View
} from '@dataview/core/types/state'
import {
  entityTable,
  order
} from '@shared/core'

const toOrderEntries = (
  recordIds: readonly RecordId[]
) => entityTable.normalize.list(
  Array.from(new Set(recordIds)).map((recordId) => ({
    id: recordId
  }))
)

export const readViewOrderIds = (
  view: Pick<View, 'order'>
): readonly RecordId[] => entityTable.read.ids(view.order)

export const normalizeRecordOrderIds = (
  recordIds: readonly RecordId[] | undefined,
  validRecordIds: ReadonlySet<RecordId>
) => order.normalizeExistingIds(recordIds, validRecordIds)

export const normalizeViewOrder = (
  view: Pick<View, 'order'>,
  validRecordIds: ReadonlySet<RecordId>
) => toOrderEntries(
  normalizeRecordOrderIds(readViewOrderIds(view), validRecordIds)
)

export const applyRecordOrder = (
  recordIds: readonly RecordId[],
  orderedIds: readonly RecordId[]
) => order.applyPreferredOrder(recordIds, orderedIds)

export interface ReorderRecordIdsOptions {
  beforeRecordId?: RecordId
}

export const reorderRecordIds = (
  recordIds: readonly RecordId[],
  targetRecordId: RecordId,
  options: ReorderRecordIdsOptions = {}
) => order.moveItem(recordIds, targetRecordId, {
  ...(options.beforeRecordId !== undefined
    ? { before: options.beforeRecordId }
    : {})
})

export interface SpliceRecordIdsOptions {
  beforeRecordId?: RecordId
}

export const spliceRecordIds = (
  recordIds: readonly RecordId[],
  targetRecordIds: readonly RecordId[],
  options: SpliceRecordIdsOptions = {}
) => order.splice(recordIds, targetRecordIds, {
  ...(options.beforeRecordId !== undefined
    ? { before: options.beforeRecordId }
    : {})
})

export const replaceViewOrder = (
  recordIds: readonly RecordId[]
) => toOrderEntries(recordIds)

export const clearViewOrder = () => toOrderEntries([])
