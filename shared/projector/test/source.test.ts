import { describe, expect, it } from 'vitest'
import type { Family } from '../src/publish'
import { createFlags } from '../src/publish'
import type { EntityDelta } from '@shared/delta'
import { idDelta } from '@shared/delta'
import {
  composeSync,
  createEntityDeltaSync,
  createIdDeltaFamilySync,
  createValueSync
} from '../src/sync'

type NodeValue = {
  value: number
}

type Snapshot = {
  title: string
  order: readonly string[]
  nodes: Family<string, NodeValue>
}

type Change = {
  title: {
    changed: boolean
  }
  nodes?: EntityDelta<string>
}

type IdDeltaChange = {
  nodes: ReturnType<typeof idDelta.create<string>>
}

const createSnapshot = (input: {
  title: string
  order: readonly string[]
  nodes: readonly (readonly [string, NodeValue])[]
}): Snapshot => ({
  title: input.title,
  order: input.order,
  nodes: {
    ids: input.order,
    byId: new Map(input.nodes)
  }
})

const createFamilySink = (initial: Family<string, NodeValue>) => ({
  ids: [...initial.ids] as string[],
  byId: new Map(initial.byId),
  apply(patch: {
    ids?: readonly string[]
    order?: readonly string[]
    set?: readonly (readonly [string, NodeValue])[]
    remove?: readonly string[]
  }) {
    const nextIds = patch.ids ?? patch.order
    if (nextIds) {
      this.ids = [...nextIds]
    }

    patch.set?.forEach(([key, value]) => {
      this.byId.set(key, value)
    })
    patch.remove?.forEach((key) => {
      this.byId.delete(key)
    })
  }
})

describe('source sync', () => {
  it('applies entity delta patches without rescanning membership', () => {
    const previous = createSnapshot({
      title: 'before',
      order: ['a', 'b'],
      nodes: [
        ['a', { value: 1 }],
        ['b', { value: 2 }]
      ]
    })
    const next = createSnapshot({
      title: 'before',
      order: ['c', 'a'],
      nodes: [
        ['c', { value: 3 }],
        ['a', { value: 10 }]
      ]
    })
    const change: Change = {
      title: createFlags(false),
      nodes: {
        order: true,
        set: ['a', 'c'],
        remove: ['b']
      }
    }
    const sink = createFamilySink(previous.nodes)

    const sync = createEntityDeltaSync({
      delta: nextChange => nextChange.nodes,
      list: snapshot => snapshot.order,
      read: (snapshot, key) => snapshot.nodes.byId.get(key),
      apply: (patch, target) => {
        target.apply(patch)
      }
    })

    sync.sync({
      previous,
      next,
      change,
      sink
    })

    expect(sink.ids).toEqual(['c', 'a'])
    expect(sink.byId.get('a')).toEqual({ value: 10 })
    expect(sink.byId.get('b')).toBeUndefined()
    expect(sink.byId.get('c')).toEqual({ value: 3 })
  })

  it('applies id delta family patches from authoritative touched ids', () => {
    const previous = createSnapshot({
      title: 'before',
      order: ['a', 'b'],
      nodes: [
        ['a', { value: 1 }],
        ['b', { value: 2 }]
      ]
    })
    const next = createSnapshot({
      title: 'before',
      order: ['c', 'a'],
      nodes: [
        ['c', { value: 3 }],
        ['a', { value: 10 }]
      ]
    })
    const change: IdDeltaChange = {
      nodes: idDelta.create<string>()
    }
    idDelta.update(change.nodes, 'a')
    idDelta.remove(change.nodes, 'b')
    idDelta.add(change.nodes, 'c')

    const sink = createFamilySink(previous.nodes)

    const sync = createIdDeltaFamilySync({
      delta: nextChange => nextChange.nodes,
      read: snapshot => snapshot.nodes,
      apply: (patch, target) => {
        target.apply(patch)
      }
    })

    sync.sync({
      previous,
      next,
      change,
      sink
    })

    expect(sink.ids).toEqual(['c', 'a'])
    expect(sink.byId.get('a')).toEqual({ value: 10 })
    expect(sink.byId.get('b')).toBeUndefined()
    expect(sink.byId.get('c')).toEqual({ value: 3 })
  })

  it('composes value and entity sync without re-diffing snapshots', () => {
    const previous = createSnapshot({
      title: 'before',
      order: ['a'],
      nodes: [
        ['a', { value: 1 }]
      ]
    })
    const next = createSnapshot({
      title: 'after',
      order: ['b', 'a'],
      nodes: [
        ['b', { value: 2 }],
        ['a', { value: 1 }]
      ]
    })
    const change: Change = {
      title: createFlags(true),
      nodes: {
        order: true,
        set: ['b'],
        remove: []
      }
    }
    const sink = {
      title: previous.title,
      family: createFamilySink(previous.nodes)
    }

    const sync = composeSync<
      Snapshot,
      Change,
      typeof sink
    >(
      createValueSync({
        hasChanged: nextChange => nextChange.title.changed,
        read: snapshot => snapshot.title,
        write: (value, target) => {
          target.title = value
        }
      }),
      createEntityDeltaSync({
        delta: nextChange => nextChange.nodes,
        list: snapshot => snapshot.order,
        read: (snapshot, key) => snapshot.nodes.byId.get(key),
        apply: (patch, target) => {
          target.family.apply(patch)
        }
      })
    )

    sync.sync({
      previous,
      next,
      change,
      sink
    })

    expect(sink.title).toBe('after')
    expect(sink.family.ids).toEqual(['b', 'a'])
    expect(sink.family.byId.get('a')).toEqual({ value: 1 })
    expect(sink.family.byId.get('b')).toEqual({ value: 2 })
  })
})
