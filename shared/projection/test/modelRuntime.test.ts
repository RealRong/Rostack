import { store } from '../../core/src/index.ts'
import { expect, it } from 'vitest'
import {
  createProjectionRuntime,
  type ProjectionSpec
} from '../src'

type Item = {
  id: string
  value: number
}

it('projection runtime family surfaces expose keyed subscriptions', () => {
  const spec = {
    createState: () => ({
      items: new Map<string, Item>()
    }),
    createRead: () => ({}),
    surface: {
      items: {
        kind: 'family',
        read: (state: {
          items: Map<string, Item>
        }) => ({
          ids: [...state.items.keys()],
          byId: state.items
        })
      }
    },
    plan: () => ({
      phases: ['items'] as const
    }),
    phases: {
      items: {
        after: [] as const,
        run: (context: {
          input: readonly Item[]
          state: {
            items: Map<string, Item>
          }
        }) => {
          context.state.items = new Map(
            context.input.map((item) => [item.id, item] as const)
          )

          return {
            action: 'sync' as const
          }
        }
      }
    }
  } satisfies ProjectionSpec<
    readonly Item[],
    {
      items: Map<string, Item>
    },
    {},
    {
      items: {
        kind: 'family'
        read(state: {
          items: Map<string, Item>
        }): {
          ids: readonly string[]
          byId: ReadonlyMap<string, Item>
        }
      }
    },
    'items',
    {
      items: undefined
    }
  >
  const runtime = createProjectionRuntime(spec)
  const projected = store.createKeyedDerivedStore<string, number | undefined>({
    get: (id) => store.read(runtime.stores.items.byId, id)?.value
  })

  expect(projected.get('a')).toBeUndefined()

  runtime.update([
    {
      id: 'a',
      value: 1
    }
  ])

  expect(projected.get('a')).toBe(1)

  runtime.update([
    {
      id: 'a',
      value: 2
    }
  ])

  expect(projected.get('a')).toBe(2)
})
