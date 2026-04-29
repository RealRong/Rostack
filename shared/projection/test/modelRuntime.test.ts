import { store } from '../../core/src/index.ts'
import { expect, it } from 'vitest'
import {
  createMutationChangeMap,
  readMutationChangeIds,
  type MutationChange,
  type MutationChangeInput
} from '@shared/mutation'
import { createProjection } from '../src'

type Item = {
  id: string
  value: number
}

const createDelta = (
  changes: Record<string, MutationChangeInput>
) => ({
  changes: createMutationChangeMap(
    Object.fromEntries(
      Object.entries(changes).map(([key, change]) => [
        key,
        normalizeChange(change)
      ])
    )
  )
})

const normalizeChange = (
  change: MutationChangeInput
): MutationChange => {
  if (change === true) {
    return {
      ids: 'all'
    }
  }

  if (Array.isArray(change)) {
    return {
      ids: change
    }
  }

  return change
}

const hasDeltaKey = (
  delta: {
    reset?: true
    changes: ReturnType<typeof createMutationChangeMap>
  },
  key: string
): boolean => delta.reset === true
  || delta.changes.has(key)

it('projection runtime exposes current output and keyed family subscriptions', () => {
  const runtime = createProjection({
    createState: () => ({
      items: new Map<string, Item>()
    }),
    createRead: () => ({}),
    output: ({ state, revision }) => ({
      revision,
      count: state.items.size
    }),
    surface: {
      items: {
        kind: 'family' as const,
        read: (state: {
          items: Map<string, Item>
        }) => ({
          ids: [...state.items.keys()],
          byId: state.items
        }),
        patch: ({ input }) => {
          if (input.delta.reset === true) {
            return 'replace'
          }

          const written = readMutationChangeIds<string>(
            input.delta.changes.get('items.write')
          )
          const removed = readMutationChangeIds<string>(
            input.delta.changes.get('items.remove')
          )
          if (written === 'all' || removed === 'all') {
            return 'replace'
          }

          const set = new Set(written ?? [])
          const remove = [...(removed ?? [])]
          remove.forEach((id) => {
            set.delete(id)
          })

          if (set.size === 0 && remove.length === 0 && !hasDeltaKey(input.delta, 'items.order')) {
            return 'skip'
          }

          return {
            ...(hasDeltaKey(input.delta, 'items.order')
              ? {
                  order: true as const
                }
              : {}),
            ...(set.size > 0
              ? {
                  set: [...set]
                }
              : {}),
            ...(remove.length > 0
              ? {
                  remove
                }
              : {})
          }
        }
      }
    },
    phases: {
      items: (ctx) => {
        ctx.state.items = new Map(
          ctx.input.items.map((item: Item) => [item.id, item] as const)
        )
        ctx.phase.items.changed = true
      }
    }
  })

  const projected = store.createKeyedDerivedStore<string, number | undefined>({
    get: (id) => store.read(runtime.stores.items.byId, id)?.value
  })

  expect(projected.get('a')).toBeUndefined()
  expect(runtime.current()).toEqual({
    revision: 0,
    count: 0
  })

  const first = runtime.update({
    delta: createDelta({
      'items.write': ['a']
    }),
    items: [{
      id: 'a',
      value: 1
    }]
  })

  expect(projected.get('a')).toBe(1)
  expect(first.output).toEqual({
    revision: 1,
    count: 1
  })
  expect(runtime.current()).toEqual(first.output)

  runtime.update({
    delta: createDelta({
      'items.write': ['a']
    }),
    items: [{
      id: 'a',
      value: 2
    }]
  })

  expect(projected.get('a')).toBe(2)
  expect(runtime.current()).toEqual({
    revision: 2,
    count: 1
  })
})
