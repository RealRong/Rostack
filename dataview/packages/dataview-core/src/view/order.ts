import type {
  RecordId,
  View
} from '@dataview/core/types/state'
import {
  order
} from '@shared/core'

export const readViewOrderIds = (
  view: Pick<View, 'order'>
): readonly RecordId[] => view.order

export const normalizeRecordOrderIds = (
  recordIds: readonly RecordId[] | undefined,
  validRecordIds: ReadonlySet<RecordId>
) => order.normalizeExistingIds(recordIds, validRecordIds)

export const normalizeViewOrder = (
  view: Pick<View, 'order'>,
  validRecordIds: ReadonlySet<RecordId>
): RecordId[] => normalizeRecordOrderIds(readViewOrderIds(view), validRecordIds)

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
): RecordId[] => Array.from(new Set(recordIds))

export const clearViewOrder = (): RecordId[] => []
