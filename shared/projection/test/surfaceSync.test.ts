import { expect, it } from 'vitest'
import { createProjectionRuntime } from '../src'

type Item = {
  id: string
  value: number
}

type Input = {
  value: number
  skipValue?: boolean
  skipItems?: boolean
  items?: readonly Item[]
  itemDelta?: 'replace' | 'skip' | {
    order?: true
    set?: readonly string[]
    remove?: readonly string[]
  }
}

type State = {
  value: number
  skipValue: boolean
  skipItems: boolean
  items: {
    ids: readonly string[]
    byId: ReadonlyMap<string, Item>
  }
  itemDelta: Input['itemDelta']
}

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

const createRuntime = (hooks: {
  onReadValue?(): void
  onReadItems?(): void
} = {}) => createProjectionRuntime<
  Input,
  State,
  {},
  {
    value: {
      kind: 'value'
      read(state: State): number
      changed(context: { state: State }): boolean
    }
    items: {
      kind: 'family'
      read(state: State): State['items']
      changed(context: { state: State }): boolean
      idsEqual(left: readonly string[], right: readonly string[]): boolean
      delta(context: {
        state: State
        previous: State['items']
        next: State['items']
      }): Input['itemDelta']
    }
  },
  'apply',
  {
    apply: undefined
  }
>({
  createState: () => ({
    value: 0,
    skipValue: false,
    skipItems: false,
    items: {
      ids: [],
      byId: new Map()
    },
    itemDelta: 'replace'
  }),
  createRead: () => ({}),
  surface: {
    value: {
      kind: 'value',
      read: (state) => {
        hooks.onReadValue?.()
        return state.value
      },
      changed: ({ state }) => !state.skipValue
    },
    items: {
      kind: 'family',
      read: (state) => {
        hooks.onReadItems?.()
        return state.items
      },
      changed: ({ state }) => !state.skipItems,
      idsEqual: sameOrder,
      delta: ({ state }) => state.itemDelta
    }
  },
  plan: () => ({
    phases: ['apply'] as const
  }),
  phases: {
    apply: {
      after: [] as const,
      run: ({ input, state }) => {
        state.value = input.value
        state.skipValue = input.skipValue === true
        state.skipItems = input.skipItems === true
        state.items = input.items
          ? {
              ids: input.items.map((item) => item.id),
              byId: new Map(input.items.map((item) => [item.id, item] as const))
            }
          : state.items
        state.itemDelta = input.itemDelta ?? 'replace'
        return {
          action: 'sync' as const
        }
      }
    }
  }
})

it('value field changed=false skips read and notification', async () => {
  let reads = 0
  const runtime = createRuntime({
    onReadValue: () => {
      reads += 1
    }
  })

  reads = 0
  let notifications = 0
  runtime.stores.value.subscribe(() => {
    notifications += 1
  })

  runtime.update({
    value: 1,
    skipValue: true
  })
  await Promise.resolve()

  expect(reads).toBe(0)
  expect(notifications).toBe(0)
  expect(runtime.stores.value.get()).toBe(0)
})

it('family field changed=false skips read and notification', async () => {
  let reads = 0
  const runtime = createRuntime({
    onReadItems: () => {
      reads += 1
    }
  })

  runtime.update({
    value: 0,
    items: [{
      id: 'a',
      value: 1
    }],
    itemDelta: 'replace'
  })
  reads = 0

  let notifications = 0
  runtime.stores.items.byId.subscribe('a', () => {
    notifications += 1
  })

  runtime.update({
    value: 0,
    skipItems: true,
    items: [{
      id: 'a',
      value: 2
    }],
    itemDelta: {
      set: ['a']
    }
  })
  await Promise.resolve()

  expect(reads).toBe(0)
  expect(notifications).toBe(0)
  expect(runtime.stores.items.byId.get('a')?.value).toBe(1)
})

it('family field delta=skip avoids store writes', async () => {
  const runtime = createRuntime()

  runtime.update({
    value: 0,
    items: [{
      id: 'a',
      value: 1
    }],
    itemDelta: 'replace'
  })

  let notifications = 0
  runtime.stores.items.byId.subscribe('a', () => {
    notifications += 1
  })

  runtime.update({
    value: 0,
    items: [{
      id: 'a',
      value: 2
    }],
    itemDelta: 'skip'
  })
  await Promise.resolve()

  expect(notifications).toBe(0)
  expect(runtime.stores.items.byId.get('a')?.value).toBe(1)
})

it('family field delta apply only patches touched keys and preserves ids reference', async () => {
  const runtime = createRuntime()

  runtime.update({
    value: 0,
    items: [{
      id: 'a',
      value: 1
    }, {
      id: 'b',
      value: 1
    }],
    itemDelta: 'replace'
  })

  const previousIds = runtime.stores.items.ids.get()
  let notifyA = 0
  let notifyB = 0
  runtime.stores.items.byId.subscribe('a', () => {
    notifyA += 1
  })
  runtime.stores.items.byId.subscribe('b', () => {
    notifyB += 1
  })

  runtime.update({
    value: 0,
    items: [{
      id: 'a',
      value: 2
    }, {
      id: 'b',
      value: 9
    }],
    itemDelta: {
      set: ['a']
    }
  })
  await Promise.resolve()

  expect(notifyA).toBe(1)
  expect(notifyB).toBe(0)
  expect(runtime.stores.items.byId.get('a')?.value).toBe(2)
  expect(runtime.stores.items.byId.get('b')?.value).toBe(1)
  expect(runtime.stores.items.ids.get()).toBe(previousIds)
})
