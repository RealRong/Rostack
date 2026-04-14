import type { RecordId } from '@dataview/core/contracts/state'

export const normalizeRecordOrderIds = (
  recordIds: readonly RecordId[] | undefined,
  validRecordIds: ReadonlySet<RecordId>
) => {
  if (!recordIds?.length) {
    return [] as RecordId[]
  }

  const normalized: RecordId[] = []
  const seen = new Set<RecordId>()

  recordIds.forEach(recordId => {
    if (!validRecordIds.has(recordId) || seen.has(recordId)) {
      return
    }
    seen.add(recordId)
    normalized.push(recordId)
  })

  return normalized
}

export const applyRecordOrder = (
  recordIds: readonly RecordId[],
  orderedIds: readonly RecordId[]
) => {
  if (!orderedIds.length) {
    return [...recordIds]
  }

  const orderedIdSet = new Set(orderedIds)
  return [
    ...orderedIds,
    ...recordIds.filter(recordId => !orderedIdSet.has(recordId))
  ]
}

export interface ReorderRecordIdsOptions {
  beforeRecordId?: RecordId
}

export const reorderRecordIds = (
  recordIds: readonly RecordId[],
  targetRecordId: RecordId,
  options: ReorderRecordIdsOptions = {}
) => {
  const filtered = recordIds.filter(recordId => recordId !== targetRecordId)
  let insertIndex = filtered.length

  if (options.beforeRecordId && options.beforeRecordId !== targetRecordId) {
    const beforeIndex = filtered.indexOf(options.beforeRecordId)
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex
    }
  }

  return [...filtered.slice(0, insertIndex), targetRecordId, ...filtered.slice(insertIndex)]
}

export interface ReorderRecordBlockIdsOptions {
  beforeRecordId?: RecordId
}

export const reorderRecordBlockIds = (
  recordIds: readonly RecordId[],
  targetRecordIds: readonly RecordId[],
  options: ReorderRecordBlockIdsOptions = {}
) => {
  const movingSet = new Set(targetRecordIds)
  const block = recordIds.filter(recordId => movingSet.has(recordId))

  if (!block.length) {
    return [...recordIds]
  }

  if (options.beforeRecordId && movingSet.has(options.beforeRecordId)) {
    return [...recordIds]
  }

  const remaining = recordIds.filter(recordId => !movingSet.has(recordId))
  let insertIndex = remaining.length

  if (options.beforeRecordId) {
    const beforeIndex = remaining.indexOf(options.beforeRecordId)
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex
    }
  }

  return [...remaining.slice(0, insertIndex), ...block, ...remaining.slice(insertIndex)]
}
