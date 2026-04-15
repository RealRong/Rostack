import assert from 'node:assert/strict'
import { test } from 'vitest'
import { gridSelection } from '@dataview/table'
import { resolveFillActions } from '@dataview/react/views/table/hooks/usePointer'

const createCurrentViewStub = () => ({
  items: {
    ids: ['row_1', 'row_2', 'row_3', 'row_4'],
    indexOf: (itemId: string) => ['row_1', 'row_2', 'row_3', 'row_4'].indexOf(itemId),
    get: (itemId: string) => (({
      row_1: {
        id: 'row_1',
        recordId: 'rec_1'
      },
      row_2: {
        id: 'row_2',
        recordId: 'rec_2'
      },
      row_3: {
        id: 'row_3',
        recordId: 'rec_3'
      },
      row_4: {
        id: 'row_4',
        recordId: 'rec_2'
      }
    }) as Record<string, {
      id: string
      recordId: string
    }>)[itemId]
  },
  fields: {
    ids: ['title', 'points'],
    indexOf: (fieldId: string) => ['title', 'points'].indexOf(fieldId)
  }
})

test('resolveFillActions batches non-title fill by field across all target rows', () => {
  const actions = resolveFillActions({
    selection: gridSelection.set(
      {
        itemId: 'row_3',
        fieldId: 'points'
      },
      {
        itemId: 'row_1',
        fieldId: 'points'
      }
    ),
    anchor: {
      itemId: 'row_1',
      fieldId: 'points'
    },
    currentView: createCurrentViewStub() as never,
    readCell: () => ({
      exists: true,
      value: 42
    })
  })

  assert.deepEqual(actions, [{
    type: 'value.set',
    target: {
      type: 'records',
      recordIds: ['rec_2', 'rec_3']
    },
    field: 'points',
    value: 42
  }])
})

test('resolveFillActions uses record.patch for title fill and dedupes repeated records', () => {
  const actions = resolveFillActions({
    selection: gridSelection.set(
      {
        itemId: 'row_4',
        fieldId: 'title'
      },
      {
        itemId: 'row_1',
        fieldId: 'title'
      }
    ),
    anchor: {
      itemId: 'row_1',
      fieldId: 'title'
    },
    currentView: createCurrentViewStub() as never,
    readCell: () => ({
      exists: true,
      value: 'Seed title'
    })
  })

  assert.deepEqual(actions, [{
    type: 'record.patch',
    target: {
      type: 'records',
      recordIds: ['rec_2', 'rec_3']
    },
    patch: {
      title: 'Seed title'
    }
  }])
})

test('resolveFillActions emits value.clear when source field is empty', () => {
  const actions = resolveFillActions({
    selection: gridSelection.set(
      {
        itemId: 'row_3',
        fieldId: 'points'
      },
      {
        itemId: 'row_1',
        fieldId: 'points'
      }
    ),
    anchor: {
      itemId: 'row_1',
      fieldId: 'points'
    },
    currentView: createCurrentViewStub() as never,
    readCell: () => ({
      exists: true,
      value: undefined
    })
  })

  assert.deepEqual(actions, [{
    type: 'value.clear',
    target: {
      type: 'records',
      recordIds: ['rec_2', 'rec_3']
    },
    field: 'points'
  }])
})
