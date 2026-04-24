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
      record: (itemId: string) => (({
        row_1: 'rec_1',
        row_2: 'rec_2',
        row_3: 'rec_3',
        row_4: 'rec_2'
      }) as Record<string, string | undefined>)[itemId],
      section: () => undefined,
      placement: () => undefined
    }
  },
  fields: collection.createOrderedKeyedCollection({
    ids: ['title', 'points'],
    all: [
      {
        id: 'title',
        kind: 'title',
        name: 'Title',
        system: true
      } as const,
      {
        id: 'points',
        kind: 'number',
        name: 'Points',
        format: 'number',
        precision: null,
        currency: null,
        useThousandsSeparator: false
      } as const
    ],
    get: fieldId => fieldId === 'title'
      ? {
          id: 'title',
          kind: 'title',
          name: 'Title',
          system: true
        }
      : fieldId === 'points'
        ? {
            id: 'points',
            kind: 'number',
            name: 'Points',
            format: 'number',
            precision: null,
            currency: null,
            useThousandsSeparator: false
          }
        : undefined
  }),
  sections: collection.createOrderedKeyedCollection({
    ids: [],
    all: [],
    get: () => undefined
  })
})

test('resolveFillWriteManyInput batches non-title fill by field across all target rows', () => {
  const grid = createGridStub()
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
    items: grid.items as never,
    fields: grid.fields as never,
    readRow: itemId => {
      const recordId = grid.items.read.record(itemId)
      return recordId
        ? {
            recordId
          }
        : undefined
    },
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
  const grid = createGridStub()
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
    items: grid.items as never,
    fields: grid.fields as never,
    readRow: itemId => {
      const recordId = grid.items.read.record(itemId)
      return recordId
        ? {
            recordId
          }
        : undefined
    },
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
  const grid = createGridStub()
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
    items: grid.items as never,
    fields: grid.fields as never,
    readRow: itemId => {
      const recordId = grid.items.read.record(itemId)
      return recordId
        ? {
            recordId
          }
        : undefined
    },
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
