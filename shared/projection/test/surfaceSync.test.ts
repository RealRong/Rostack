import { expect, it } from 'vitest'
import type {
  ProjectionFamilyChange,
  ProjectionFamilySnapshot,
  ProjectionValueChange
} from '../src'
import { createProjection } from '../src'

type Item = {
  id: string
  value: number
}

type Input = {
  delta: TestDelta
  value: number
  items?: readonly Item[]
  skipValue?: boolean
  customPatch?: 'replace' | 'skip' | ProjectionFamilyChange<string, Item>
}

type State = {
  value: number
  items: ProjectionFamilySnapshot<string, Item>
  valueChange: ProjectionValueChange<number>
  declaredValueChange: ProjectionValueChange<number>
  itemsChange: ProjectionFamilyChange<string, Item>
  customItemsChange: ProjectionFamilyChange<string, Item>
}

type TestDeltaChanges = Readonly<Record<string, {
  ids?: readonly string[] | 'all'
}>>

type TestDelta = {
  byKey: TestDeltaChanges
  reset(): boolean
}

const EMPTY_CHANGES: TestDeltaChanges = Object.freeze(
  Object.create(null)
)

const createDelta = (
  changes: TestDeltaChanges = EMPTY_CHANGES
): TestDelta => ({
  byKey: changes,
  reset: () => false
})

const hasDeltaKey = (
  delta: TestDelta,
  key: string
): boolean => (
  delta.reset()
  || Object.prototype.hasOwnProperty.call(delta.byKey, key)
)

const readTouchedIds = (
  delta: TestDelta,
  key: string
): Set<string> | 'all' => {
  if (delta.reset()) {
    return 'all'
  }

  const ids = delta.byKey[key]?.ids
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

const toSnapshot = (
  items: readonly Item[] | undefined
): ProjectionFamilySnapshot<string, Item> => {
  if (!items?.length) {
    return {
      ids: [],
      byId: new Map()
    }
  }

  return {
    ids: items.map((item) => item.id),
    byId: new Map(items.map((item) => [item.id, item] as const))
  }
}

const buildItemsChange = (input: {
  delta: TestDelta
  snapshot: ProjectionFamilySnapshot<string, Item>
}): ProjectionFamilyChange<string, Item> => {
  if (input.delta.reset()) {
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

  const touched = new Set<string>([
    ...created,
    ...updated
  ])
  removed.forEach((id) => {
    touched.delete(id)
  })

  const set = [...touched].map((id) => {
    const value = input.snapshot.byId.get(id)
    if (value === undefined) {
      throw new Error(`Missing item snapshot for ${id}.`)
    }

    return [id, value] as const
  })

  return {
    ...(order
      ? {
          ids: input.snapshot.ids
        }
      : {}),
    ...(set.length > 0
      ? {
          set
        }
      : {}),
    ...(removed.size > 0
      ? {
          remove: [...removed]
        }
      : {})
  }
}

const createRuntime = (hooks: {
  onReadValue?(): void
  onReadItems?(): void
} = {}) => createProjection({
  createState: (): State => ({
    value: 0,
    items: toSnapshot(undefined),
    valueChange: 'skip',
    declaredValueChange: 'skip',
    itemsChange: 'skip',
    customItemsChange: 'skip'
  }),
  createRead: () => ({}),
  capture: ({ state }) => ({
    value: state.value,
    itemCount: state.items.ids.length
  }),
  stores: {
    value: {
      kind: 'value' as const,
      read: (state: State) => {
        hooks.onReadValue?.()
        return state.value
      },
      change: (state: State) => state.valueChange
    },
    declaredValue: {
      kind: 'value' as const,
      read: (state: State) => state.value,
      change: (state: State) => state.declaredValueChange
    },
    items: {
      kind: 'family' as const,
      read: (state: State) => {
        hooks.onReadItems?.()
        return state.items
      },
      idsEqual: sameOrder,
      change: (state: State) => state.itemsChange
    },
    customItems: {
      kind: 'family' as const,
      read: (state: State) => state.items,
      idsEqual: sameOrder,
      change: (state: State) => state.customItemsChange
    }
  },
  phases: {
    apply: (ctx) => {
      ctx.state.value = ctx.input.value
      ctx.state.items = ctx.input.items
        ? toSnapshot(ctx.input.items)
        : ctx.state.items
      ctx.state.valueChange = ctx.input.skipValue === true
        ? 'skip'
        : {
            value: ctx.state.value
          }
      ctx.state.declaredValueChange = hasDeltaKey(ctx.input.delta, 'value.changed')
        ? {
            value: ctx.state.value
          }
        : 'skip'
      ctx.state.itemsChange = buildItemsChange({
        delta: ctx.input.delta,
        snapshot: ctx.state.items
      })
      ctx.state.customItemsChange = hasDeltaKey(ctx.input.delta, 'items.custom')
        ? (ctx.input.customPatch ?? 'replace')
        : 'skip'
      ctx.phase.apply.changed = (
        ctx.state.valueChange !== 'skip'
        || ctx.state.declaredValueChange !== 'skip'
        || ctx.state.itemsChange !== 'skip'
        || ctx.state.customItemsChange !== 'skip'
      )
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
      'value.changed': {
        ids: 'all'
      }
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
      'items.create': {
        ids: ['a', 'b']
      }
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
      'items.update': {
        ids: ['a']
      }
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
      'items.custom': {
        ids: 'all'
      }
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
      'items.custom': {
        ids: 'all'
      }
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
