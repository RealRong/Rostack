import { equal } from '@shared/core'
import type {
  RecordId
} from '@dataview/core/types'
import type {
  Rows
} from '@dataview/engine/active/shared/rows'
import {
  EMPTY_ROWS
} from '@dataview/engine/active/shared/rows'

const EMPTY_INDEXES = [] as readonly number[]
const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_RECORD_ID_SET = new Set<RecordId>()
const EMPTY_RECORD_ORDER = new Map<RecordId, number>()
const FULL_INDEXES_CACHE = new WeakMap<Rows, readonly number[]>()

export interface Selection {
  rows: Rows
  indexes: readonly number[]
  ids: readonly RecordId[]
  read: {
    count: () => number
    index: (offset: number) => number | undefined
    at: (offset: number) => RecordId | undefined
    ids: () => readonly RecordId[]
  }
}

const ID_SET_CACHE = new WeakMap<Selection, ReadonlySet<RecordId>>()
const ORDER_CACHE = new WeakMap<Selection, ReadonlyMap<RecordId, number>>()

const isFullRowsSelection = (
  rows: Rows,
  indexes: readonly number[]
) => indexes.length === rows.ids.length
  && indexes.every((value, index) => value === index)

const readFullSelectionIndexes = (
  rows: Rows
): readonly number[] => {
  const cached = FULL_INDEXES_CACHE.get(rows)
  if (cached) {
    return cached
  }

  const created = new Array<number>(rows.ids.length)
  for (let index = 0; index < rows.ids.length; index += 1) {
    created[index] = index
  }
  FULL_INDEXES_CACHE.set(rows, created)
  return created
}

const materializeSelectionIds = (
  rows: Rows,
  indexes: readonly number[]
): readonly RecordId[] => {
  if (!indexes.length) {
    return EMPTY_RECORD_IDS
  }

  const ids = new Array<RecordId>(indexes.length)
  for (let offset = 0; offset < indexes.length; offset += 1) {
    ids[offset] = rows.at(indexes[offset]!)!
  }
  return ids
}

export const EMPTY_SELECTION: Selection = {
  rows: EMPTY_ROWS,
  indexes: EMPTY_INDEXES,
  ids: EMPTY_RECORD_IDS,
  read: {
    count: () => 0,
    index: () => undefined,
    at: () => undefined,
    ids: () => EMPTY_RECORD_IDS
  }
}

export const createSelection = (input: {
  rows: Rows
  indexes: readonly number[]
  ids?: readonly RecordId[]
  previous?: Selection
}): Selection => {
  const fullIndexes = isFullRowsSelection(input.rows, input.indexes)
    ? readFullSelectionIndexes(input.rows)
    : undefined
  const indexes = fullIndexes ?? input.indexes

  if (input.previous && input.previous.rows === input.rows) {
    if (input.previous.indexes === indexes) {
      return input.previous
    }

    if (equal.sameOrder(input.previous.indexes, indexes)) {
      return input.previous
    }
  }

  const ids = input.ids
    ?? (
      fullIndexes
        ? input.rows.ids
        : materializeSelectionIds(input.rows, indexes)
    )

  return {
    rows: input.rows,
    indexes,
    ids,
    read: {
      count: () => indexes.length,
      index: offset => indexes[offset],
      at: offset => {
        const index = indexes[offset]
        return index === undefined
          ? undefined
          : input.rows.at(index)
      },
      ids: () => ids
    }
  }
}

export const createSelectionFromIds = (input: {
  rows: Rows
  ids: readonly RecordId[]
  previous?: Selection
}): Selection => {
  if (input.previous && equal.sameOrder(input.previous.ids, input.ids)) {
    if (input.previous.rows === input.rows) {
      return input.previous
    }

    if (input.previous.rows.ids === input.rows.ids) {
      return createSelection({
        rows: input.rows,
        indexes: input.previous.indexes,
        ids: input.previous.ids
      })
    }
  }

  if (!input.ids.length) {
    return createSelection({
      rows: input.rows,
      indexes: EMPTY_INDEXES,
      ids: EMPTY_RECORD_IDS,
      previous: input.previous
    })
  }

  if (input.ids === input.rows.ids) {
    return createSelection({
      rows: input.rows,
      indexes: readFullSelectionIndexes(input.rows),
      ids: input.rows.ids,
      previous: input.previous
    })
  }

  const indexes = new Array<number>(input.ids.length)
  for (let index = 0; index < input.ids.length; index += 1) {
    indexes[index] = input.rows.indexOf(input.ids[index]!)!
  }

  return createSelection({
    rows: input.rows,
    indexes,
    ids: input.ids,
    previous: input.previous
  })
}

export const readSelectionIds = (
  selection: Selection
): readonly RecordId[] => selection.ids

export const readSelectionIdSet = (
  selection: Selection
): ReadonlySet<RecordId> => {
  const existing = ID_SET_CACHE.get(selection)
  if (existing) {
    return existing
  }

  const ids = selection.ids
  if (!ids.length) {
    return EMPTY_RECORD_ID_SET
  }

  const created = new Set(ids)
  ID_SET_CACHE.set(selection, created)
  return created
}

export const readSelectionOrder = (
  selection: Selection
): ReadonlyMap<RecordId, number> => {
  const existing = ORDER_CACHE.get(selection)
  if (existing) {
    return existing
  }

  const ids = selection.ids
  if (!ids.length) {
    return EMPTY_RECORD_ORDER
  }

  const created = new Map<RecordId, number>()
  for (let index = 0; index < ids.length; index += 1) {
    created.set(ids[index]!, index)
  }
  ORDER_CACHE.set(selection, created)
  return created
}
