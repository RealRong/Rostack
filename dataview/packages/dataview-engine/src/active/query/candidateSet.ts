import type {
  RecordId,
  View
} from '@dataview/core/types'
import { field as fieldApi } from '@dataview/core/field'
import { applyRecordOrder } from '@dataview/core/view/order'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type { DocumentReader } from '@dataview/core/document/reader'

export interface QueryReuseState {
  matched?: readonly RecordId[]
  ordered?: readonly RecordId[]
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()
const REVERSED_SORT_IDS = new WeakMap<readonly RecordId[], readonly RecordId[]>()
const EMPTY_LAST_REVERSED_SORT_IDS = new WeakMap<readonly RecordId[], readonly RecordId[]>()
const ORDER_ORDINALS_BY_IDS = new WeakMap<
  readonly RecordId[],
  WeakMap<ReadonlyMap<RecordId, number>, Int32Array>
>()

interface CandidateScratch {
  count: Uint32Array
  generation: number
  seenList: Uint32Array
  stamp: Uint32Array
}

const CANDIDATE_SCRATCH_BY_RECORDS = new WeakMap<readonly RecordId[], CandidateScratch>()

const readCandidateScratch = (
  recordIds: readonly RecordId[]
): CandidateScratch => {
  const cached = CANDIDATE_SCRATCH_BY_RECORDS.get(recordIds)
  if (cached) {
    return cached
  }

  const created: CandidateScratch = {
    stamp: new Uint32Array(recordIds.length),
    count: new Uint32Array(recordIds.length),
    seenList: new Uint32Array(recordIds.length),
    generation: 1
  }
  CANDIDATE_SCRATCH_BY_RECORDS.set(recordIds, created)
  return created
}

const nextScratchGeneration = (
  scratch: CandidateScratch
): number => {
  if (scratch.generation === 0xffffffff) {
    scratch.stamp.fill(0)
    scratch.count.fill(0)
    scratch.seenList.fill(0)
    scratch.generation = 1
    return scratch.generation
  }

  scratch.generation += 1
  return scratch.generation
}

const readOrderOrdinals = (
  ids: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): Int32Array => {
  const cachedByOrder = ORDER_ORDINALS_BY_IDS.get(ids)
  const cached = cachedByOrder?.get(order)
  if (cached) {
    return cached
  }

  const ordinals = new Int32Array(ids.length)
  for (let index = 0; index < ids.length; index += 1) {
    ordinals[index] = order.get(ids[index]!) ?? -1
  }

  const nextByOrder = cachedByOrder ?? new WeakMap<ReadonlyMap<RecordId, number>, Int32Array>()
  nextByOrder.set(order, ordinals)
  if (!cachedByOrder) {
    ORDER_ORDINALS_BY_IDS.set(ids, nextByOrder)
  }

  return ordinals
}

const projectIdsByMembership = (input: {
  orderedIds: readonly RecordId[]
  candidateIds: readonly RecordId[]
  allRecordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  reverse?: boolean
}): readonly RecordId[] => {
  if (!input.orderedIds.length || !input.candidateIds.length) {
    return EMPTY_RECORD_IDS
  }

  const scratch = readCandidateScratch(input.allRecordIds)
  const generation = nextScratchGeneration(scratch)
  const candidateOrdinals = readOrderOrdinals(input.candidateIds, input.order)
  for (let index = 0; index < input.candidateIds.length; index += 1) {
    const ordinal = candidateOrdinals[index]!
    if (ordinal >= 0) {
      scratch.stamp[ordinal] = generation
    }
  }

  const projected: RecordId[] = []
  const orderedOrdinals = readOrderOrdinals(input.orderedIds, input.order)
  if (!input.reverse) {
    for (let index = 0; index < input.orderedIds.length; index += 1) {
      const ordinal = orderedOrdinals[index]!
      if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
        projected.push(input.orderedIds[index]!)
      }
    }
    return projected
  }

  for (let index = input.orderedIds.length - 1; index >= 0; index -= 1) {
    const ordinal = orderedOrdinals[index]!
    if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
      projected.push(input.orderedIds[index]!)
    }
  }

  return projected
}

const collectCandidateLists = (input: {
  lists: readonly (readonly RecordId[])[]
  scanOrder: readonly RecordId[]
  allRecordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  requireAll?: boolean
}): readonly RecordId[] => {
  if (!input.lists.length || !input.scanOrder.length) {
    return EMPTY_RECORD_IDS
  }

  const scratch = readCandidateScratch(input.allRecordIds)
  const generation = nextScratchGeneration(scratch)

  for (let listIndex = 0; listIndex < input.lists.length; listIndex += 1) {
    const list = input.lists[listIndex]!
    const listToken = listIndex + 1
    const ordinals = readOrderOrdinals(list, input.order)
    for (let index = 0; index < list.length; index += 1) {
      const ordinal = ordinals[index]!
      if (ordinal < 0) {
        continue
      }

      if (scratch.stamp[ordinal] !== generation) {
        scratch.stamp[ordinal] = generation
        scratch.count[ordinal] = 0
        scratch.seenList[ordinal] = 0
      }

      if (scratch.seenList[ordinal] === listToken) {
        continue
      }

      scratch.seenList[ordinal] = listToken
      scratch.count[ordinal] += 1
    }
  }

  const requiredCount = input.requireAll
    ? input.lists.length
    : 1
  const collected: RecordId[] = []
  const scanOrdinals = readOrderOrdinals(input.scanOrder, input.order)
  for (let index = 0; index < input.scanOrder.length; index += 1) {
    const ordinal = scanOrdinals[index]!
    if (
      ordinal >= 0
      && scratch.stamp[ordinal] === generation
      && scratch.count[ordinal] >= requiredCount
    ) {
      collected.push(input.scanOrder[index]!)
    }
  }

  return collected
}

const projectIdsToCurrentOrder = (
  orderedIds: readonly RecordId[],
  currentIds: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => projectIdsByMembership({
  orderedIds,
  candidateIds: currentIds,
  allRecordIds,
  order
})

const reverseOrderedIds = (
  ids: readonly RecordId[]
): readonly RecordId[] => {
  if (ids.length <= 1) {
    return ids
  }

  const cached = REVERSED_SORT_IDS.get(ids)
  if (cached) {
    return cached
  }

  const reversed = new Array<RecordId>(ids.length)
  for (let index = 0; index < ids.length; index += 1) {
    reversed[index] = ids[ids.length - index - 1]!
  }
  REVERSED_SORT_IDS.set(ids, reversed)
  return reversed
}

const findEmptyTailStart = (input: {
  ids: readonly RecordId[]
  values: ReadonlyMap<RecordId, unknown>
}): number => {
  let start = input.ids.length

  while (start > 0) {
    const recordId = input.ids[start - 1]!
    if (!fieldApi.value.empty(input.values.get(recordId))) {
      break
    }

    start -= 1
  }

  return start
}

const reverseOrderedIdsKeepingEmptyLast = (input: {
  ids: readonly RecordId[]
  values: ReadonlyMap<RecordId, unknown>
}): readonly RecordId[] => {
  if (input.ids.length <= 1) {
    return input.ids
  }

  const emptyTailStart = findEmptyTailStart(input)
  if (emptyTailStart === input.ids.length) {
    return reverseOrderedIds(input.ids)
  }

  const cached = EMPTY_LAST_REVERSED_SORT_IDS.get(input.ids)
  if (cached) {
    return cached
  }

  const reversed = new Array<RecordId>(input.ids.length)
  let cursor = 0

  for (let index = emptyTailStart - 1; index >= 0; index -= 1) {
    reversed[cursor] = input.ids[index]!
    cursor += 1
  }
  for (let index = emptyTailStart; index < input.ids.length; index += 1) {
    reversed[cursor] = input.ids[index]!
    cursor += 1
  }

  EMPTY_LAST_REVERSED_SORT_IDS.set(input.ids, reversed)
  return reversed
}

const projectIdsToCurrentOrderKeepingEmptyLast = (input: {
  orderedIds: readonly RecordId[]
  currentIds: readonly RecordId[]
  allRecordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  values: ReadonlyMap<RecordId, unknown>
}): readonly RecordId[] => {
  if (!input.orderedIds.length || !input.currentIds.length) {
    return EMPTY_RECORD_IDS
  }

  const scratch = readCandidateScratch(input.allRecordIds)
  const generation = nextScratchGeneration(scratch)
  const candidateOrdinals = readOrderOrdinals(input.currentIds, input.order)
  for (let index = 0; index < input.currentIds.length; index += 1) {
    const ordinal = candidateOrdinals[index]!
    if (ordinal >= 0) {
      scratch.stamp[ordinal] = generation
    }
  }

  const emptyTailStart = findEmptyTailStart({
    ids: input.orderedIds,
    values: input.values
  })
  const ordinals = readOrderOrdinals(input.orderedIds, input.order)
  const projected: RecordId[] = []

  for (let index = emptyTailStart - 1; index >= 0; index -= 1) {
    const ordinal = ordinals[index]!
    if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
      projected.push(input.orderedIds[index]!)
    }
  }
  for (let index = emptyTailStart; index < input.orderedIds.length; index += 1) {
    const ordinal = ordinals[index]!
    if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
      projected.push(input.orderedIds[index]!)
    }
  }

  return projected
}

const sortRecordIds = (input: {
  ids: readonly RecordId[]
  reader: DocumentReader
  index: IndexState
  view: View
}): readonly RecordId[] => {
  const sortRules = input.view.sort.rules.ids.flatMap(ruleId => {
    const rule = input.view.sort.rules.byId[ruleId]
    return rule ? [rule] : []
  })

  if (!sortRules.length) {
    return input.ids
  }

  if (sortRules.length === 1) {
    const rule = sortRules[0]!
    const fieldIndex = input.index.sort.fields.get(rule.fieldId)
    if (fieldIndex) {
      const fieldValues = input.index.records.values.get(rule.fieldId)?.byRecord ?? EMPTY_VALUE_MAP
      if (input.ids === input.index.records.ids) {
        return rule.direction === 'desc'
          ? reverseOrderedIdsKeepingEmptyLast({
              ids: fieldIndex.asc,
              values: fieldValues
            })
          : fieldIndex.asc
      }

      return rule.direction === 'desc'
        ? projectIdsToCurrentOrderKeepingEmptyLast({
            orderedIds: fieldIndex.asc,
            currentIds: input.ids,
            allRecordIds: input.index.records.ids,
            order: input.index.records.order,
            values: fieldValues
          })
        : projectIdsToCurrentOrder(
            fieldIndex.asc,
            input.ids,
            input.index.records.ids,
            input.index.records.order
          )
    }
  }

  const sortEntries = sortRules.map(rule => ({
    direction: rule.direction,
    field: input.reader.fields.get(rule.fieldId),
    values: input.index.records.values.get(rule.fieldId)?.byRecord
  }))

  return input.ids.slice().sort((leftId, rightId) => {
    for (const sortEntry of sortEntries) {
      const result = fieldApi.compare.sort(
        sortEntry.field,
        sortEntry.values?.get(leftId),
        sortEntry.values?.get(rightId),
        sortEntry.direction
      )

      if (result !== 0) {
        return result
      }
    }

    return (input.index.records.order.get(leftId) ?? Number.MAX_SAFE_INTEGER)
      - (input.index.records.order.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  })
}

const applyViewOrders = (
  ids: readonly RecordId[],
  view: View,
  reader: DocumentReader
): readonly RecordId[] => {
  if (view.sort.rules.ids.length > 0 || !view.orders.length) {
    return ids
  }

  const normalizedOrders = reader.records.normalize(view.orders, ids)
  return normalizedOrders.length
    ? applyRecordOrder(ids, normalizedOrders)
    : ids
}

export const sortIdsByRecordOrder = (
  ids: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => collectCandidateLists({
  lists: [ids],
  scanOrder: allRecordIds,
  allRecordIds,
  order
})

export const intersectCandidates = (
  left: readonly RecordId[],
  right: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => collectCandidateLists({
  lists: [left, right],
  scanOrder: allRecordIds,
  allRecordIds,
  order,
  requireAll: true
})

export const unionCandidates = (
  lists: readonly (readonly RecordId[])[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => collectCandidateLists({
  lists,
  scanOrder: allRecordIds,
  allRecordIds,
  order
})

export const projectCandidatesToOrderedIds = (
  ordered: readonly RecordId[],
  candidates: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => projectIdsByMembership({
  orderedIds: ordered,
  candidateIds: candidates,
  allRecordIds,
  order
})

export const resolveQueryOrderState = (input: {
  reader: DocumentReader
  view: View
  index: IndexState
  reuse?: QueryReuseState
}): {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
} => {
  const matched = input.reuse?.matched
    ?? sortRecordIds({
      ids: input.index.records.ids,
      reader: input.reader,
      index: input.index,
      view: input.view
    })
  const ordered = input.reuse?.ordered
    ?? applyViewOrders(matched, input.view, input.reader)

  return {
    matched,
    ordered
  }
}
