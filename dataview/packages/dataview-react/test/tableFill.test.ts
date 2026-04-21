import assert from 'node:assert/strict'
import { test } from 'vitest'
import { collection } from '@shared/core'
import { gridSelection } from '@dataview/table'
import { resolveFillWriteManyInput } from '@dataview/react/views/table/hooks/usePointer'

const createOrderedIdsStub = (ids: readonly string[]) => ({
  ids,
  ...collection.createOrderedAccess(ids)
})

const createCurrentViewStub = () => ({
  items: {
    ...createOrderedIdsStub(['row_1', 'row_2', 'row_3', 'row_4']),
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
  fields: createOrderedIdsStub(['title', 'points'])
})

test('resolveFillWriteManyInput batches non-title fill by field across all target rows', () => {
  const input = resolveFillWriteManyInput({
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

  assert.deepEqual(input, {
    recordIds: ['rec_2', 'rec_3'],
    set: {
      points: 42
    }
  })
})

test('resolveFillWriteManyInput includes title writes and dedupes repeated records', () => {
  const input = resolveFillWriteManyInput({
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

  assert.deepEqual(input, {
    recordIds: ['rec_2', 'rec_3'],
    set: {
      title: 'Seed title'
    }
  })
})

test('resolveFillWriteManyInput emits clear when source field is empty', () => {
  const input = resolveFillWriteManyInput({
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

  assert.deepEqual(input, {
    recordIds: ['rec_2', 'rec_3'],
    clear: ['points']
  })
})
