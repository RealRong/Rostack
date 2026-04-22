import { describe, expect, it } from 'vitest'
import {
  assertPhaseOrder,
  createFlags,
  createHarness,
  createIds,
  createPlan,
  createRuntime,
  publishFamily,
  publishList,
  publishValue
} from '../src'
import type {
  Family,
  Flags,
  Ids
} from '../src'

type PhaseName = 'count' | 'label' | 'items'

type Input = {
  count: number
  labels: readonly string[]
}

type InputChange = {
  count: Flags
  labels: Flags
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
  items: Ids<string>
}

const EMPTY_ITEMS: Family<string, ItemView> = {
  ids: [],
  byId: new Map()
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
  planner: {
    plan: (input: {
      change: InputChange
      previous: Snapshot
    }) => createPlan<PhaseName>({
      phases: [
        ...(input.change.count.changed ? ['count' as const] : []),
        ...(input.change.labels.changed ? ['items' as const] : [])
      ]
    })
  },
  publisher: {
    publish: (input: {
      revision: number
      previous: Snapshot
      working: Working
    }): {
      snapshot: Snapshot
      change: Change
    } => {
      const count = publishValue({
        previous: input.previous.state.count,
        next: input.working.count
      })
      const label = publishValue({
        previous: input.previous.state.label,
        next: input.working.label
      })
      const labels = publishList({
        previous: input.previous.state.labels,
        next: input.working.items.map((item) => item.id)
      })
      const nextItems = new Map(
        input.working.items.map((item) => [item.id, item] as const)
      )
      const items = publishFamily({
        previous: input.previous.state.items,
        ids: input.working.items.map((item) => item.id),
        read: (id: string) => nextItems.get(id)!,
        publish: ({
          previous,
          next
        }) => previous
          ? publishValue({
              previous,
              next,
              isEqual: (left, right) => (
                left.id === right.id && left.value === right.value
              )
            })
          : {
              value: next,
              changed: true,
              action: 'rebuild' as const
            }
      })

      return {
        snapshot: {
          revision: input.revision,
          state: {
            count: count.value,
            label: label.value,
            labels: labels.value,
            items: items.value
          }
        },
        change: {
          count: createFlags(count.changed),
          label: createFlags(label.changed),
          labels: createFlags(labels.changed),
          items: items.ids
        }
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
        change: createFlags(next !== context.previous.state.count),
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
        change: createFlags(next !== context.previous.state.label),
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
      const changed = (
        next.length !== context.previous.state.items.ids.length
        || next.some((item) => {
          const previous = context.previous.state.items.byId.get(item.id)
          return !previous || previous.value !== item.value
        })
      )

      return {
        action: changed
          ? 'rebuild' as const
          : 'reuse' as const,
        change: createIds(next.map((item) => item.id)),
        metrics: {
          outputCount: next.length
        }
      }
    }
  }]
})

describe('createRuntime', () => {
  it('runs phases in topological order and publishes once', () => {
    const runtime = createRuntime(createSpec())
    const published: Change[] = []

    const unsubscribe = runtime.subscribe((result) => {
      published.push(result.change)
    })

    const result = runtime.update({
      count: 2,
      labels: ['a', 'b']
    }, {
      count: createFlags(true),
      labels: createFlags(false)
    })

    unsubscribe()

    expect(published).toHaveLength(1)
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
      labels: ['a']
    }, {
      count: createFlags(true),
      labels: createFlags(false)
    })

    const result = harness.update({
      count: 2,
      labels: ['alpha', 'beta']
    }, {
      count: createFlags(false),
      labels: createFlags(true)
    })

    assertPhaseOrder(result.trace, ['items'])
    expect(result.change.count.changed).toBe(false)
    expect(result.change.label.changed).toBe(false)
    expect(result.change.labels.changed).toBe(true)
    expect(result.snapshot.state.items.ids).toEqual(['alpha', 'beta'])
  })

  it('reuses unchanged published references when no effective change occurs', () => {
    const runtime = createRuntime(createSpec())

    runtime.update({
      count: 3,
      labels: ['a', 'b']
    }, {
      count: createFlags(true),
      labels: createFlags(false)
    })

    const previous = runtime.snapshot()
    const result = runtime.update({
      count: 3,
      labels: ['a', 'b']
    }, {
      count: createFlags(false),
      labels: createFlags(false)
    })

    expect(result.trace.phases).toHaveLength(0)
    expect(result.snapshot.state.items).toBe(previous.state.items)
    expect(result.snapshot.state.labels).toBe(previous.state.labels)
    expect(result.snapshot.state.label).toBe(previous.state.label)
    expect(result.change.items.all.size).toBe(0)
    expect(result.change.count.changed).toBe(false)
  })

  it('rejects cyclic phase graphs', () => {
    expect(() => createRuntime({
      createWorking: () => ({}),
      createSnapshot: () => ({}),
      planner: {
        plan: () => createPlan<'a' | 'b'>({
          phases: ['a']
        })
      },
      publisher: {
        publish: () => ({
          snapshot: {},
          change: {}
        })
      },
      phases: [{
        name: 'a' as const,
        deps: ['b'] as const,
        run: () => ({
          action: 'reuse' as const,
          change: {}
        })
      }, {
        name: 'b' as const,
        deps: ['a'] as const,
        run: () => ({
          action: 'reuse' as const,
          change: {}
        })
      }]
    })).toThrow('Projection runtime phases must form a DAG.')
  })
})
