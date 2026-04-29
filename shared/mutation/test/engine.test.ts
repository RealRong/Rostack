import { describe, expect, test } from 'vitest'
import {
  MutationEngine,
  type MutationEntitySpec
} from '@shared/mutation'
import type {
  MutationCurrent,
  MutationIntentTable
} from '@shared/mutation/engine'

type ItemId = `item_${number}`

type Item = {
  id: ItemId
  title: string
}

type TestDoc = {
  items: {
    ids: ItemId[]
    byId: Partial<Record<ItemId, Item>>
  }
  activeItemId?: ItemId
}

type TestOp =
  | {
      type: 'item.create'
      value: Item
    }
  | {
      type: 'item.patch'
      id: ItemId
      patch: Partial<Pick<Item, 'title'>>
    }
  | {
      type: 'document.patch'
      patch: Partial<Pick<TestDoc, 'activeItemId'>>
    }

interface TestIntentTable extends MutationIntentTable {
  'item.add': {
    intent: {
      type: 'item.add'
      id: ItemId
      title: string
    }
    output: ItemId
  }
  'item.open': {
    intent: {
      type: 'item.open'
      id: ItemId
    }
    output: ItemId
  }
}

const entities = {
  item: {
    kind: 'table',
    members: {
      title: 'field'
    },
    change: {
      title: ['title']
    }
  },
  document: {
    kind: 'singleton',
    members: {
      activeItemId: 'field'
    },
    change: {
      activeItemId: ['activeItemId']
    }
  }
} as const satisfies Readonly<Record<string, MutationEntitySpec>>

const createDocument = (): TestDoc => ({
  items: {
    ids: [],
    byId: {}
  },
  activeItemId: undefined
})

const createEngine = () => new MutationEngine<
  TestDoc,
  TestIntentTable,
  TestOp
>({
  document: createDocument(),
  normalize: (document) => document,
  entities,
  compile: {
    'item.add': ({ intent, emit, output }) => {
      emit({
        type: 'item.create',
        value: {
          id: intent.id,
          title: intent.title
        }
      })
      output(intent.id)
    },
    'item.open': ({ intent, emit, output }) => {
      emit({
        type: 'document.patch',
        patch: {
          activeItemId: intent.id
        }
      })
      output(intent.id)
    }
  }
})

describe('MutationEngine current API', () => {
  test('applies canonical entity operations and emits watch/commit updates', () => {
    const engine = createEngine()
    const commits: string[] = []
    const snapshots: MutationCurrent<TestDoc>[] = []

    engine.subscribe((commit) => {
      commits.push(commit.kind)
    })
    engine.watch((current) => {
      snapshots.push(current)
    })

    const result = engine.apply({
      type: 'item.create',
      value: {
        id: 'item_1',
        title: 'First'
      }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.items.ids).toEqual(['item_1'])
    expect(result.commit.document.items.byId.item_1).toEqual({
      id: 'item_1',
      title: 'First'
    })
    expect(result.commit.inverse).toEqual([{
      type: 'item.delete',
      id: 'item_1'
    }])
    expect(Boolean(result.commit.delta.changes['item.create'])).toBe(true)
    expect(commits).toEqual(['apply'])
    expect(snapshots).toEqual([{
      rev: 1,
      document: result.commit.document
    }])
    expect(engine.history.get().undoDepth).toBe(1)
  })

  test('executes typed intents through compile handlers and returns outputs', () => {
    const engine = createEngine()
    const result = engine.execute([{
      type: 'item.add',
      id: 'item_1',
      title: 'First'
    }, {
      type: 'item.open',
      id: 'item_1'
    }])

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.data).toEqual(['item_1', 'item_1'])
    expect(result.commit.document.items.byId.item_1).toEqual({
      id: 'item_1',
      title: 'First'
    })
    expect(result.commit.document.activeItemId).toBe('item_1')
    expect(Boolean(result.commit.delta.changes['item.create'])).toBe(true)
    expect(Boolean(result.commit.delta.changes['document.activeItemId'])).toBe(true)
  })

  test('replace publishes a reset delta and clears local history', () => {
    const engine = createEngine()
    engine.apply({
      type: 'item.create',
      value: {
        id: 'item_1',
        title: 'First'
      }
    })

    const commit = engine.replace(createDocument(), {
      origin: 'system'
    })

    expect(commit.kind).toBe('replace')
    expect(commit.delta.reset).toBe(true)
    expect(engine.current()).toEqual({
      rev: 2,
      document: createDocument()
    })
    expect(engine.history.get().undoDepth).toBe(0)
  })
})
