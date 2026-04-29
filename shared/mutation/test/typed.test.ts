import { describe, expect, test } from 'vitest'
import type {
  MutationEntitySpec
} from '@shared/mutation'
import {
  createDeltaBuilder,
  createTypedMutationDelta,
  defineEntityMutationSchema
} from '@shared/mutation'
import type {
  MutationPathCodec
} from '@shared/mutation/typed'

type ItemId = `item_${number}`
type ItemField = 'title' | 'status'

type ItemPath = {
  field: ItemField
}

const ITEM_PATH_CODEC: MutationPathCodec<ItemPath> = {
  parse: (path) => (
    path === 'title' || path === 'status'
      ? {
          field: path
        }
      : undefined
  ),
  format: (path) => path.field
}

const entities = {
  item: {
    kind: 'table',
    members: {
      title: 'field',
      values: 'record'
    },
    change: {
      title: ['title'],
      values: ['values.**']
    }
  },
  document: {
    kind: 'singleton',
    members: {
      activeItemId: 'field'
    },
    change: {
      activeItemId: ['activeItemId']
    }
  }
} as const satisfies Readonly<Record<string, MutationEntitySpec>>

describe('typed mutation schema helpers', () => {
  test('derives schema from entities and merges overrides/signals', () => {
    const schema = defineEntityMutationSchema({
      entities,
      entries: {
        'item.values': {
          paths: ITEM_PATH_CODEC
        }
      },
      signals: {
        'external.version': {}
      }
    })

    expect(Object.keys(schema).sort()).toEqual([
      'document.activeItemId',
      'external.version',
      'item.create',
      'item.delete',
      'item.title',
      'item.values'
    ])
    expect(schema['item.create']).toEqual({
      ids: true
    })
    expect(schema['item.title']).toEqual({
      ids: true
    })
    expect(schema['item.values']).toEqual({
      ids: true,
      paths: ITEM_PATH_CODEC
    })
    expect(schema['document.activeItemId']).toEqual({})
  })

  test('builds typed delta fragments and merges them back to canonical input', () => {
    const schema = defineEntityMutationSchema({
      entities,
      entries: {
        'item.values': {
          paths: ITEM_PATH_CODEC
        }
      },
      signals: {
        'external.version': {}
      }
    })
    const delta = createDeltaBuilder(schema)

    const merged = delta.merge(
      delta.ids('item.create', ['item_1']),
      delta.paths('item.values', {
        item_1: [{
          field: 'status'
        }]
      }),
      delta.flag('document.activeItemId'),
      delta.flag('external.version')
    )

    expect(merged).toEqual({
      changes: {
        'item.create': {
          ids: ['item_1']
        },
        'item.values': {
          paths: {
            item_1: ['status']
          }
        },
        'document.activeItemId': {
          ids: 'all'
        },
        'external.version': {
          ids: 'all'
        }
      }
    })
  })

  test('typed delta facade reads ids and typed paths from merged input', () => {
    const schema = defineEntityMutationSchema({
      entities,
      entries: {
        'item.values': {
          paths: ITEM_PATH_CODEC
        }
      },
      signals: {
        'external.version': {}
      }
    })
    const delta = createDeltaBuilder(schema)
    const raw = delta.merge(
      delta.paths('item.values', {
        item_1: [{
          field: 'status'
        }, {
          field: 'title'
        }]
      }),
      delta.flag('external.version')
    )

    const typed = createTypedMutationDelta({
      raw,
      schema,
      build: (context) => ({
        valuePaths: (id: ItemId) => context.pathsOf('item.values', id),
        valuesChanged: (id: ItemId, field: ItemField) => context.matches(
          'item.values',
          id,
          (path) => path.field === field
        ),
        signalChanged: () => context.has('external.version')
      })
    })

    expect(typed.valuePaths('item_1')).toEqual([{
      field: 'status'
    }, {
      field: 'title'
    }])
    expect(typed.valuesChanged('item_1', 'status')).toBe(true)
    expect(typed.valuesChanged('item_1', 'title')).toBe(true)
    expect(typed.signalChanged()).toBe(true)
  })
})
