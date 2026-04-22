import assert from 'node:assert/strict'
import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Rows
} from '@dataview/engine/active/shared/rows'
import {
  createSelectionFromIds
} from '@dataview/engine/active/shared/selection'
import { test } from 'vitest'

const createRows = (input: {
  ids: readonly RecordId[]
  indexOf?: (id: RecordId) => number | undefined
}): Rows => {
  const order = new Map<RecordId, number>()
  input.ids.forEach((recordId, index) => {
    order.set(recordId, index)
  })

  return {
    ids: input.ids,
    indexOf: input.indexOf ?? (recordId => order.get(recordId)),
    at: index => input.ids[index],
    column: {
      value: () => undefined,
      calc: () => undefined,
      search: () => undefined,
      bucket: () => undefined
    }
  }
}

test('createSelectionFromIds reuses previous indexes when rows wrapper changes without record order changes', () => {
  const rowIds = ['rec_1', 'rec_2', 'rec_3'] as const
  const previousRows = createRows({
    ids: rowIds
  })
  let nextIndexOfCalls = 0
  const nextRows = createRows({
    ids: rowIds,
    indexOf: recordId => {
      nextIndexOfCalls += 1
      return rowIds.indexOf(recordId)
    }
  })

  const previous = createSelectionFromIds({
    rows: previousRows,
    ids: ['rec_3', 'rec_1']
  })
  const next = createSelectionFromIds({
    rows: nextRows,
    ids: ['rec_3', 'rec_1'],
    previous
  })

  assert.equal(nextIndexOfCalls, 0)
  assert.notEqual(next, previous)
  assert.equal(next.ids, previous.ids)
  assert.equal(next.indexes, previous.indexes)
  assert.equal(next.read.ids(), next.ids)
  assert.equal(next.read.ids(), previous.read.ids())
})
