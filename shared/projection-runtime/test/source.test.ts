import { describe, expect, it } from 'vitest'
import {
  composeSync,
  createEventSink,
  createEventSync,
  createFamilySink,
  createFamilySync,
  createFlags,
  createIds,
  createListSink,
  createListSync,
  createValueSink,
  createValueSync
} from '../src'
import type { Family } from '../src'

type Snapshot = {
  title: string
  order: readonly string[]
  nodes: Family<string, {
    value: number
  }>
  version: number
}

type Change = {
  title: {
    changed: boolean
  }
  order: {
    changed: boolean
  }
  nodes: {
    all: ReadonlySet<string>
  }
  version: {
    changed: boolean
  }
}

const createSnapshot = (input: {
  title: string
  order: readonly string[]
  nodes: readonly (readonly [string, {
    value: number
  }])[]
  version: number
}): Snapshot => ({
  title: input.title,
  order: input.order,
  nodes: {
    ids: input.order,
    byId: new Map(input.nodes)
  },
  version: input.version
})

describe('source sync', () => {
  it('applies family updates from authoritative changed ids', () => {
    const previous = createSnapshot({
      title: 'before',
      order: ['a', 'b'],
      nodes: [
        ['a', { value: 1 }],
        ['b', { value: 2 }]
      ],
      version: 1
    })
    const next = createSnapshot({
      title: 'before',
      order: ['c', 'a'],
      nodes: [
        ['c', { value: 3 }],
        ['a', { value: 10 }]
      ],
      version: 2
    })
    const change: Change = {
      title: createFlags(false),
      order: createFlags(true),
      nodes: createIds(['a', 'b', 'c']),
      version: createFlags(false)
    }
    const sink = createFamilySink<string, {
      value: number
    }>()

    sink.set('a', { value: 1 })
    sink.set('b', { value: 2 })
    sink.order(['a', 'b'])

    const sync = createFamilySync({
      ids: (nextChange: Change) => nextChange.nodes.all,
      list: (snapshot: Snapshot) => snapshot.order,
      read: (snapshot: Snapshot, key: string) => snapshot.nodes.byId.get(key),
      set: sink.set,
      remove: sink.remove,
      hasOrderChanged: (nextChange: Change) => nextChange.order.changed,
      order: sink.order
    })

    sync.sync({
      previous,
      next,
      change,
      sink
    })

    expect(sink.get().ids).toEqual(['c', 'a'])
    expect(sink.get().byId.get('a')).toEqual({ value: 10 })
    expect(sink.get().byId.get('b')).toBeUndefined()
    expect(sink.get().byId.get('c')).toEqual({ value: 3 })
  })

  it('composes value, list, and event sync without re-diffing snapshots', () => {
    const previous = createSnapshot({
      title: 'before',
      order: ['a'],
      nodes: [
        ['a', { value: 1 }]
      ],
      version: 1
    })
    const next = createSnapshot({
      title: 'after',
      order: ['b', 'a'],
      nodes: [
        ['b', { value: 2 }],
        ['a', { value: 1 }]
      ],
      version: 2
    })
    const change: Change = {
      title: createFlags(true),
      order: createFlags(true),
      nodes: createIds(['a', 'b']),
      version: createFlags(true)
    }
    const titleSink = createValueSink(previous.title)
    const orderSink = createListSink(previous.order)
    const eventSink = createEventSink<number>()

    const sync = composeSync(
      createValueSync({
        hasChanged: (nextChange: Change) => nextChange.title.changed,
        read: (snapshot: Snapshot) => snapshot.title,
        write: titleSink.set
      }),
      createListSync({
        hasChanged: (nextChange: Change) => nextChange.order.changed,
        read: (snapshot: Snapshot) => snapshot.order,
        write: orderSink.set
      }),
      createEventSync({
        hasChanged: (nextChange: Change) => nextChange.version.changed,
        build: (input) => input.next.version,
        emit: eventSink.emit
      })
    )

    sync.sync({
      previous,
      next,
      change,
      sink: null
    })

    expect(titleSink.get()).toBe('after')
    expect(orderSink.get()).toEqual(['b', 'a'])
    expect(eventSink.get()).toEqual([2])
  })
})
