import { expect, it } from 'vitest'
import {
  createMutationChangeMap,
  EMPTY_MUTATION_CHANGE_MAP,
  readMutationChangeIds,
  type MutationChange,
  type MutationChangeInput,
  type MutationDelta
} from '@shared/mutation'
import { createProjection } from '../src'

type Item = {
  id: string
  value: number
}

type Input = {
  delta: MutationDelta
  value: number
  items?: readonly Item[]
  skipValue?: boolean
  customPatch?: 'replace' | 'skip' | {
    order?: true
    set?: readonly string[]
    remove?: readonly string[]
  }
}

type State = {
  value: number
  skipValue: boolean
  items: {
    ids: readonly string[]
    byId: ReadonlyMap<string, Item>
  }
  customPatch: Input['customPatch']
}

const createDelta = (
  changes?: Record<string, MutationChangeInput>
): MutationDelta => ({
  changes: changes
    ? createMutationChangeMap(
        Object.fromEntries(
          Object.entries(changes).map(([key, change]) => [
            key,
            normalizeChange(change)
          ])
        )
      )
    : EMPTY_MUTATION_CHANGE_MAP
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
  delta: MutationDelta,
  key: string
): boolean => delta.reset === true
  || delta.changes.has(key)

const readTouchedIds = (
  delta: MutationDelta,
  key: string
): Set<string> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  const ids = readMutationChangeIds<string>(delta.changes.get(key))
  if (ids === 'all') {
    return 'all'
  }

  return new Set(ids ?? [])
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
} = {}) => createProjection({
  createState: (): State => ({
    value: 0,
    skipValue: false,
    items: {
      ids: [],
      byId: new Map()
    },
    customPatch: 'replace'
  }),
  createRead: () => ({}),
  output: ({ state }) => ({
    value: state.value,
    itemCount: state.items.ids.length
  }),
  surface: {
    value: {
      kind: 'value' as const,
      read: (state: State) => {
        hooks.onReadValue?.()
        return state.value
      },
      changed: ({ state }: { state: State }) => !state.skipValue
    },
    declaredValue: {
      kind: 'value' as const,
      read: (state: State) => state.value,
      changed: ({ input }) => hasDeltaKey(input.delta, 'value.changed')
    },
    items: {
      kind: 'family' as const,
      read: (state: State) => {
        hooks.onReadItems?.()
        return state.items
      },
      idsEqual: sameOrder,
      patch: ({ input }) => {
        if (input.delta.reset === true) {
          return 'replace'
        }

        const created = readTouchedIds(input.delta, 'items.create')
        const updated = readTouchedIds(input.delta, 'items.update')
        const removed = readTouchedIds(input.delta, 'items.remove')
        const order = hasDeltaKey(input.delta, 'items.order')
        if (
          created !== 'all'
          && updated !== 'all'
          && removed !== 'all'
          && created.size === 0
          && updated.size === 0
          && removed.size === 0
          && !order
        ) {
          return 'skip'
        }
        if (created === 'all' || updated === 'all' || removed === 'all') {
          return 'replace'
        }

        const set = new Set<string>([
          ...created,
          ...updated
        ])
        removed.forEach((id) => {
          set.delete(id)
        })

        return {
          ...(order
            ? {
                order: true as const
              }
            : {}),
          ...(set.size > 0
            ? {
                set: [...set]
              }
            : {}),
          ...(removed.size > 0
            ? {
                remove: [...removed]
              }
            : {})
        }
      }
    },
    customItems: {
      kind: 'family' as const,
      read: (state: State) => state.items,
      idsEqual: sameOrder,
      changed: ({ input }) => hasDeltaKey(input.delta, 'items.custom'),
      patch: ({ state }: { state: State }) => state.customPatch ?? 'replace'
    }
  },
  phases: {
    apply: (ctx) => {
      ctx.state.value = ctx.input.value
      ctx.state.skipValue = ctx.input.skipValue === true
      ctx.state.items = ctx.input.items
        ? {
            ids: ctx.input.items.map((item) => item.id),
            byId: new Map(ctx.input.items.map((item) => [item.id, item] as const))
          }
        : ctx.state.items
      ctx.state.customPatch = ctx.input.customPatch
      ctx.phase.apply.changed = true
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
    delta: createDelta(),
    value: 1,
    skipValue: true
  })
  await Promise.resolve()

  expect(reads).toBe(0)
  expect(notifications).toBe(0)
  expect(runtime.stores.value.get()).toBe(0)
})

it('declared changed keys gate value store updates', async () => {
  const runtime = createRuntime()
  let notifications = 0
  runtime.stores.declaredValue.subscribe(() => {
    notifications += 1
  })

  runtime.update({
    delta: createDelta(),
    value: 1
  })
  await Promise.resolve()

  expect(notifications).toBe(0)
  expect(runtime.stores.declaredValue.get()).toBe(0)

  runtime.update({
    delta: createDelta({
      'value.changed': true
    }),
    value: 2
  })
  await Promise.resolve()

  expect(notifications).toBe(1)
  expect(runtime.stores.declaredValue.get()).toBe(2)
})

it('simple family patch applies only touched keys and preserves ids reference', async () => {
  const runtime = createRuntime()

  runtime.update({
    delta: createDelta({
      'items.create': ['a', 'b']
    }),
    value: 0,
    items: [{
      id: 'a',
      value: 1
    }, {
      id: 'b',
      value: 1
    }]
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
    delta: createDelta({
      'items.update': ['a']
    }),
    value: 0,
    items: [{
      id: 'a',
      value: 2
    }, {
      id: 'b',
      value: 9
    }]
  })
  await Promise.resolve()

  expect(notifyA).toBe(1)
  expect(notifyB).toBe(0)
  expect(runtime.stores.items.byId.get('a')?.value).toBe(2)
  expect(runtime.stores.items.byId.get('b')?.value).toBe(1)
  expect(runtime.stores.items.ids.get()).toBe(previousIds)
})

it('custom family patch builder can skip writes', async () => {
  const runtime = createRuntime()

  runtime.update({
    delta: createDelta({
      'items.custom': true
    }),
    value: 0,
    items: [{
      id: 'a',
      value: 1
    }],
    customPatch: 'replace'
  })

  let notifications = 0
  runtime.stores.customItems.byId.subscribe('a', () => {
    notifications += 1
  })

  runtime.update({
    delta: createDelta({
      'items.custom': true
    }),
    value: 0,
    items: [{
      id: 'a',
      value: 2
    }],
    customPatch: 'skip'
  })
  await Promise.resolve()

  expect(notifications).toBe(0)
  expect(runtime.stores.customItems.byId.get('a')?.value).toBe(1)
})
