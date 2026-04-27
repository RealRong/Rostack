import type { RecordId } from '@dataview/core/types/state'
import { order } from '@shared/core'


export const normalizeRecordOrderIds = (
  recordIds: readonly RecordId[] | undefined,
  validRecordIds: ReadonlySet<RecordId>
) => order.normalizeExistingIds(recordIds, validRecordIds)

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

export interface ReorderRecordBlockIdsOptions {
  beforeRecordId?: RecordId
}

export const reorderRecordBlockIds = (
  recordIds: readonly RecordId[],
  targetRecordIds: readonly RecordId[],
  options: ReorderRecordBlockIdsOptions = {}
) => order.moveBlock(recordIds, targetRecordIds, {
  ...(options.beforeRecordId !== undefined
    ? { before: options.beforeRecordId }
    : {})
})
