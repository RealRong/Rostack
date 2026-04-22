import assert from 'node:assert/strict'
import { test } from 'vitest'
import { collection } from '@shared/core'
import { gridSelection } from '@dataview/table'
import { resolveFillWriteManyInput } from '@dataview/react/views/table/hooks/usePointer'

const createOrderedIdsStub = (ids: readonly string[]) => {
  const order = collection.createOrderedAccess(ids)
  return {
    ids,
    count: order.count,
    order,
    ...order
  }
}

const createGridStub = () => ({
  items: {
    ...createOrderedIdsStub(['row_1', 'row_2', 'row_3', 'row_4']),
    read: {
      recordId: (itemId: string) => (({
        row_1: 'rec_1',
        row_2: 'rec_2',
        row_3: 'rec_3',
        row_4: 'rec_2'
      }) as Record<string, string | undefined>)[itemId],
      sectionKey: () => undefined,
      placement: () => undefined
    }
  },
  fields: createOrderedIdsStub(['title', 'points']),
  sections: collection.createOrderedKeyedCollection({
    ids: [],
    all: [],
    get: () => undefined
  })
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
    grid: createGridStub() as never,
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
    grid: createGridStub() as never,
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
    grid: createGridStub() as never,
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
