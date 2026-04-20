import type { RecordId } from '@dataview/core/contracts/state'
import {
  applyPreferredOrder,
  moveBlock,
  moveItem,
  normalizeExistingIds
} from '@shared/core'

export const normalizeRecordOrderIds = (
  recordIds: readonly RecordId[] | undefined,
  validRecordIds: ReadonlySet<RecordId>
) => normalizeExistingIds(recordIds, validRecordIds)

export const applyRecordOrder = (
  recordIds: readonly RecordId[],
  orderedIds: readonly RecordId[]
) => applyPreferredOrder(recordIds, orderedIds)

export interface ReorderRecordIdsOptions {
  beforeRecordId?: RecordId
}

export const reorderRecordIds = (
  recordIds: readonly RecordId[],
  targetRecordId: RecordId,
  options: ReorderRecordIdsOptions = {}
) => moveItem(recordIds, targetRecordId, {
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
) => moveBlock(recordIds, targetRecordIds, {
  ...(options.beforeRecordId !== undefined
    ? { before: options.beforeRecordId }
    : {})
})
