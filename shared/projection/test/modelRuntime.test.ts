import { store } from '@shared/core'
import { expect, it } from 'vitest'
import {
  createProjectionRuntime,
  defineProjectionModel,
  family
} from '../src'

type Item = {
  id: string
  value: number
}

it('projection runtime family surfaces expose keyed subscriptions', () => {
  const runtime = createProjectionRuntime(defineProjectionModel({
    createState: () => ({
      items: new Map<string, Item>()
    }),
    createRead: () => ({}),
    surface: {
      items: family({
        read: (state) => ({
          ids: [...state.items.keys()],
          byId: state.items
        })
      })
    },
    plan: () => ({
      phases: new Set(['items'] as const)
    }),
    phases: [{
      name: 'items' as const,
      deps: [] as const,
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
    }]
  }))
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
