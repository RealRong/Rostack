import { equal } from '@shared/core'
import type {
  RecordId
} from '@dataview/core/contracts'
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

export interface Selection {
  rows: Rows
  indexes: readonly number[]
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

export const EMPTY_SELECTION: Selection = {
  rows: EMPTY_ROWS,
  indexes: EMPTY_INDEXES,
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
  previous?: Selection
}): Selection => {
  if (input.previous && input.previous.rows === input.rows) {
    if (input.previous.indexes === input.indexes) {
      return input.previous
    }

    if (equal.sameOrder(input.previous.indexes, input.indexes)) {
      return input.previous
    }
  }

  const ids = isFullRowsSelection(input.rows, input.indexes)
    ? input.rows.ids
    : undefined

  return {
    rows: input.rows,
    indexes: input.indexes,
    read: {
      count: () => input.indexes.length,
      index: offset => input.indexes[offset],
      at: offset => {
        const index = input.indexes[offset]
        return index === undefined
          ? undefined
          : input.rows.at(index)
      },
      ids: () => {
        if (ids) {
          return ids
        }

        const next = new Array<RecordId>(input.indexes.length)
        for (let offset = 0; offset < input.indexes.length; offset += 1) {
          next[offset] = input.rows.at(input.indexes[offset]!)!
        }
        return next
      }
    }
  }
}

export const createSelectionFromIds = (input: {
  rows: Rows
  ids: readonly RecordId[]
  previous?: Selection
}): Selection => {
  if (!input.ids.length) {
    return createSelection({
      rows: input.rows,
      indexes: EMPTY_INDEXES,
      previous: input.previous
    })
  }

  if (input.ids === input.rows.ids) {
    return createSelection({
      rows: input.rows,
      indexes: input.rows.ids.map((_id, index) => index),
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
    previous: input.previous
  })
}

export const readSelectionIds = (
  selection: Selection
): readonly RecordId[] => selection.read.ids()

export const readSelectionIdSet = (
  selection: Selection
): ReadonlySet<RecordId> => {
  const existing = ID_SET_CACHE.get(selection)
  if (existing) {
    return existing
  }

  const ids = selection.read.ids()
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

  const ids = selection.read.ids()
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
