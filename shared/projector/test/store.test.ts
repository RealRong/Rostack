import { describe, expect, test } from 'vitest'
import {
  createProjectorStore,
  family,
  value
} from '../src'
import {
  idDelta,
  writeEntityChange
} from '../src/delta'

type Item = {
  id: string
  value: number
}

type Snapshot = {
  title: string
  items: {
    ids: readonly string[]
    byId: ReadonlyMap<string, Item>
  }
}

type Change = {
  titleChanged: boolean
  items: ReturnType<typeof idDelta.create<string>>
}

const createSnapshot = (input: {
  title: string
  items: readonly Item[]
}): Snapshot => ({
  title: input.title,
  items: {
    ids: input.items.map((item) => item.id),
    byId: new Map(
      input.items.map((item) => [item.id, item] as const)
    )
  }
})

const createStoreSpec = () => ({
  fields: {
    title: value<Snapshot, Change, string>({
      read: (snapshot) => snapshot.title,
      changed: (change) => change.titleChanged
    }),
    items: family<Snapshot, Change, string, Item>({
      read: (snapshot) => snapshot.items,
      delta: (change) => change.items
    })
  }
})

describe('projector store', () => {
  test('syncs value and family fields from manual input', () => {
    const previous = createSnapshot({
      title: 'before',
      items: [{
        id: 'a',
        value: 1
      }]
    })
    const next = createSnapshot({
      title: 'after',
      items: [{
        id: 'b',
        value: 2
      }, {
        id: 'a',
        value: 3
      }]
    })
    const change: Change = {
      titleChanged: true,
      items: idDelta.create<string>()
    }
    idDelta.add(change.items, 'b')
    idDelta.update(change.items, 'a')

    const projection = createProjectorStore({
      initial: previous,
      spec: createStoreSpec()
    })

    expect(projection.read.title.get()).toBe('before')
    expect(projection.read.items.ids.get()).toEqual(['a'])
    expect(projection.read.items.byId.get('a')).toEqual({
      id: 'a',
      value: 1
    })

    projection.sync({
      previous,
      next,
      change
    })

    expect(projection.snapshot()).toBe(next)
    expect(projection.read.title.get()).toBe('after')
    expect(projection.read.items.ids.get()).toEqual(['b', 'a'])
    expect(projection.read.items.byId.get('a')).toEqual({
      id: 'a',
      value: 3
    })
    expect(projection.read.items.byId.get('b')).toEqual({
      id: 'b',
      value: 2
    })
  })

  test('runtime mode auto-syncs until disposed', () => {
    const initial = createSnapshot({
      title: 'before',
      items: [{
        id: 'a',
        value: 1
      }]
    })
    let current = initial
    const listeners = new Set<(snapshot: Snapshot, change: Change) => void>()
    const runtime = {
      snapshot: () => current,
      subscribe: (listener: (snapshot: Snapshot, change: Change) => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }
    }
    const projection = createProjectorStore({
      runtime,
      spec: createStoreSpec()
    })
    const firstChange: Change = {
      titleChanged: true,
      items: idDelta.create<string>()
    }
    const firstNext = createSnapshot({
      title: 'after',
      items: [{
        id: 'a',
        value: 10
      }]
    })
    idDelta.update(firstChange.items, 'a')

    current = firstNext
    listeners.forEach((listener) => {
      listener(firstNext, firstChange)
    })

    expect(projection.read.title.get()).toBe('after')
    expect(projection.read.items.byId.get('a')).toEqual({
      id: 'a',
      value: 10
    })

    projection.dispose()

    const secondChange: Change = {
      titleChanged: true,
      items: idDelta.create<string>()
    }
    const secondNext = createSnapshot({
      title: 'final',
      items: [{
        id: 'a',
        value: 20
      }]
    })
    idDelta.update(secondChange.items, 'a')
    current = secondNext
    listeners.forEach((listener) => {
      listener(secondNext, secondChange)
    })

    expect(projection.read.title.get()).toBe('after')
    expect(projection.read.items.byId.get('a')).toEqual({
      id: 'a',
      value: 10
    })
  })
})

describe('writeEntityChange', () => {
  test('writes canonical add update remove transitions into id delta', () => {
    const delta = idDelta.create<string>()

    writeEntityChange({
      delta,
      id: 'added',
      previous: undefined,
      next: {
        id: 'added',
        value: 1
      }
    })
    writeEntityChange({
      delta,
      id: 'updated',
      previous: {
        id: 'updated',
        value: 1
      },
      next: {
        id: 'updated',
        value: 2
      },
      equal: (left, right) => left.value === right.value
    })
    writeEntityChange({
      delta,
      id: 'removed',
      previous: {
        id: 'removed',
        value: 1
      },
      next: undefined
    })

    expect(delta.added).toEqual(new Set(['added']))
    expect(delta.updated).toEqual(new Set(['updated']))
    expect(delta.removed).toEqual(new Set(['removed']))
  })
})
