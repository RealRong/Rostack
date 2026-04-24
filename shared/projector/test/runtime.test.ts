import { describe, expect, it } from 'vitest'
import { createPlan, createProjector } from '../src'
import {
  idDelta,
  type IdDelta
} from '../src/delta'
import {
  createFlags,
  publishEntityFamily,
  publishEntityList,
  type Family,
  type Flags
} from '../src/publish'
import {
  assertPhaseOrder,
  assertPublishedOnce,
  createHarness
} from '../src/testing'

type PhaseName = 'count' | 'label' | 'items'

type Input = {
  count: number
  labels: readonly string[]
  impact: {
    count: Flags
    labels: Flags
  }
}

type ItemView = {
  id: string
  value: number
}

type Working = {
  count: number
  label: string
  items: readonly ItemView[]
}

type Snapshot = {
  revision: number
  state: {
    count: number
    label: string
    labels: readonly string[]
    items: Family<string, ItemView>
  }
}

type Change = {
  count: Flags
  label: Flags
  labels: Flags
  items: IdDelta<string>
}

type ScopedPhaseName = 'left' | 'right' | 'sink'

type ScopedScopeMap = {
  left: {
    values: readonly number[]
  }
  right: {
    values: readonly number[]
  }
  sink: {
    values: readonly number[]
  }
}

const EMPTY_ITEMS: Family<string, ItemView> = {
  ids: [],
  byId: new Map()
}

const isItemEqual = (
  left: ItemView | undefined,
  right: ItemView | undefined
): boolean => left?.id === right?.id && left?.value === right?.value

const buildItemChange = (input: {
  previous: Family<string, ItemView>
  next: readonly ItemView[]
}): IdDelta<string> => {
  const change = idDelta.create<string>()
  const nextById = new Map(input.next.map((item) => [item.id, item] as const))

  input.previous.ids.forEach((id) => {
    if (!nextById.has(id)) {
      idDelta.remove(change, id)
    }
  })

  input.next.forEach((item) => {
    const previous = input.previous.byId.get(item.id)
    if (!previous) {
      idDelta.add(change, item.id)
      return
    }

    if (!isItemEqual(previous, item)) {
      idDelta.update(change, item.id)
    }
  })

  return change
}

const hasItemListChanged = (input: {
  previous: Family<string, ItemView>
  next: readonly ItemView[]
}): boolean => {
  if (input.previous.ids.length !== input.next.length) {
    return true
  }

  for (let index = 0; index < input.next.length; index += 1) {
    const item = input.next[index]!
    if (input.previous.ids[index] !== item.id) {
      return true
    }

    if (!isItemEqual(input.previous.byId.get(item.id), item)) {
      return true
    }
  }

  return false
}

const createSpec = () => ({
  createWorking: (): Working => ({
    count: 0,
    label: '',
    items: []
  }),
  createSnapshot: (): Snapshot => ({
    revision: 0,
    state: {
      count: 0,
      label: '',
      labels: [],
      items: EMPTY_ITEMS
    }
  }),
  plan: (input: {
    input: Input
  }) => createPlan<PhaseName>({
    phases: [
      ...(input.input.impact.count.changed ? ['count' as const] : []),
      ...(input.input.impact.labels.changed ? ['items' as const] : [])
    ]
  }),
  publish: (input: {
    revision: number
    previous: Snapshot
    working: Working
  }) => {
    const nextItemIds = input.working.items.map((item) => item.id)
    const nextItemsById = new Map(
      input.working.items.map((item) => [item.id, item] as const)
    )
    const labels = publishEntityList({
      previous: input.previous.state.labels,
      next: nextItemIds
    })
    const items = publishEntityFamily({
      previous: input.previous.state.items,
      ids: nextItemIds,
      change: buildItemChange({
        previous: input.previous.state.items,
        next: input.working.items
      }),
      read: (id: string) => nextItemsById.get(id)
    })
    const countChanged = input.previous.state.count !== input.working.count
    const labelChanged = input.previous.state.label !== input.working.label

    return {
      snapshot: {
        revision: input.revision,
        state: {
          count: countChanged
            ? input.working.count
            : input.previous.state.count,
          label: labelChanged
            ? input.working.label
            : input.previous.state.label,
          labels: labels.value,
          items: items.value
        }
      },
      change: {
        count: createFlags(countChanged),
        label: createFlags(labelChanged),
        labels: createFlags(Boolean(labels.delta)),
        items: items.change
      }
    }
  },
  phases: [{
    name: 'count' as const,
    deps: [] as const,
    run: (context: {
      input: Input
      previous: Snapshot
      working: Working
    }) => {
      const next = context.input.count * 2
      context.working.count = next
      return {
        action: next === context.previous.state.count
          ? 'reuse' as const
          : 'rebuild' as const,
        metrics: {
          outputCount: 1
        }
      }
    }
  }, {
    name: 'label' as const,
    deps: ['count'] as const,
    run: (context: {
      previous: Snapshot
      working: Working
    }) => {
      const next = `label:${context.working.count}`
      context.working.label = next
      return {
        action: next === context.previous.state.label
          ? 'reuse' as const
          : 'rebuild' as const,
        metrics: {
          outputCount: 1
        }
      }
    }
  }, {
    name: 'items' as const,
    deps: ['label'] as const,
    run: (context: {
      input: Input
      previous: Snapshot
      working: Working
    }) => {
      const next = context.input.labels.map((id, index) => ({
        id,
        value: context.working.count + index
      }))
      context.working.items = next

      return {
        action: hasItemListChanged({
          previous: context.previous.state.items,
          next
        })
          ? 'rebuild' as const
          : 'reuse' as const,
        metrics: {
          outputCount: next.length
        }
      }
    }
  }]
})

const createScopedSpec = () => ({
  createWorking: () => ({
    seen: [] as readonly number[]
  }),
  createSnapshot: () => ({
    seen: [] as readonly number[]
  }),
  plan: () => createPlan<ScopedPhaseName, ScopedScopeMap>({
    phases: ['left', 'right'],
    scope: {
      left: {
        values: [1]
      },
      right: {
        values: [2]
      }
    }
  }),
  publish: (input: {
    working: {
      seen: readonly number[]
    }
  }) => ({
    snapshot: {
      seen: input.working.seen
    },
    change: input.working.seen
  }),
  phases: [{
    name: 'left' as const,
    deps: [] as const,
    run: (context: {
      scope: ScopedScopeMap['left']
    }) => ({
      action: 'sync' as const,
      emit: {
        sink: {
          values: context.scope.values
        }
      }
    })
  }, {
    name: 'right' as const,
    deps: [] as const,
    run: (context: {
      scope: ScopedScopeMap['right']
    }) => ({
      action: 'sync' as const,
      emit: {
        sink: {
          values: context.scope.values
        }
      }
    })
  }, {
    name: 'sink' as const,
    deps: ['left', 'right'] as const,
    mergeScope: (
      current: ScopedScopeMap['sink'] | undefined,
      next: ScopedScopeMap['sink']
    ) => ({
      values: [
        ...(current?.values ?? []),
        ...next.values
      ]
    }),
    run: (context: {
      working: {
        seen: readonly number[]
      }
      scope: ScopedScopeMap['sink']
    }) => {
      context.working.seen = context.scope.values
      return {
        action: 'sync' as const
      }
    }
  }]
})

describe('createProjector', () => {
  it('runs phases in topological order and publishes once', () => {
    const runtime = createProjector(createSpec())
    const published: Array<ReturnType<typeof runtime.update>> = []

    const unsubscribe = runtime.subscribe((result) => {
      published.push(result)
    })

    const result = runtime.update({
      count: 2,
      labels: ['a', 'b'],
      impact: {
        count: createFlags(true),
        labels: createFlags(false)
      }
    })

    unsubscribe()

    assertPublishedOnce(published)
    expect(result.snapshot.revision).toBe(1)
    expect(result.snapshot.state.count).toBe(4)
    expect(result.snapshot.state.label).toBe('label:4')
    expect(result.snapshot.state.items.ids).toEqual(['a', 'b'])
    assertPhaseOrder(result.trace, ['count', 'label', 'items'])
  })

  it('only runs planned phases when upstream inputs are stable', () => {
    const harness = createHarness(createSpec())

    harness.update({
      count: 2,
      labels: ['a'],
      impact: {
        count: createFlags(true),
        labels: createFlags(false)
      }
    })

    const result = harness.update({
      count: 2,
      labels: ['alpha', 'beta'],
      impact: {
        count: createFlags(false),
        labels: createFlags(true)
      }
    })

    assertPhaseOrder(result.trace, ['items'])
    expect(result.change.count.changed).toBe(false)
    expect(result.change.label.changed).toBe(false)
    expect(result.change.labels.changed).toBe(true)
    expect(result.snapshot.state.items.ids).toEqual(['alpha', 'beta'])
  })

  it('reuses unchanged published references when no effective change occurs', () => {
    const runtime = createProjector(createSpec())

    runtime.update({
      count: 3,
      labels: ['a', 'b'],
      impact: {
        count: createFlags(true),
        labels: createFlags(false)
      }
    })

    const previous = runtime.snapshot()
    const result = runtime.update({
      count: 3,
      labels: ['a', 'b'],
      impact: {
        count: createFlags(false),
        labels: createFlags(false)
      }
    })

    expect(result.trace.phases).toHaveLength(0)
    expect(result.snapshot.state.items).toBe(previous.state.items)
    expect(result.snapshot.state.labels).toBe(previous.state.labels)
    expect(result.snapshot.state.label).toBe(previous.state.label)
    expect(idDelta.hasAny(result.change.items)).toBe(false)
    expect(result.change.count.changed).toBe(false)
  })

  it('rejects cyclic phase graphs', () => {
    expect(() => createProjector({
      createWorking: () => ({}),
      createSnapshot: () => ({}),
      plan: () => createPlan<'a' | 'b'>({
        phases: ['a']
      }),
      publish: () => ({
        snapshot: {},
        change: {}
      }),
      phases: [{
        name: 'a' as const,
        deps: ['b'] as const,
        run: () => ({
          action: 'reuse' as const
        })
      }, {
        name: 'b' as const,
        deps: ['a'] as const,
        run: () => ({
          action: 'reuse' as const
        })
      }]
    })).toThrow('Projection runtime phases must form a DAG.')
  })

  it('merges emitted scope before running downstream phases', () => {
    const runtime = createProjector(createScopedSpec())

    const result = runtime.update({
      count: 0,
      labels: [],
      impact: {
        count: createFlags(false),
        labels: createFlags(false)
      }
    })

    expect(result.snapshot.seen).toEqual([1, 2])
    assertPhaseOrder(result.trace, ['left', 'right', 'sink'])
  })
})
