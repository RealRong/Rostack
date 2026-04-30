import { describe, expect, test } from 'vitest'
import {
  MutationEngine,
  type MutationEntitySpec,
  type MutationStructuralCanonicalOperation,
  type MutationTreeSnapshot
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
  TestOp,
  TestDoc
>({
  document: createDocument(),
  normalize: (document) => document,
  createReader: (readDocument) => readDocument(),
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
    expect(engine.reader()).toEqual(result.commit.document)
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

type StructuralDoc = {
  ordered: {
    items: string[]
  }
  tree: MutationTreeSnapshot<string>
}

const createStructuralDocument = (): StructuralDoc => ({
  ordered: {
    items: ['a', 'b', 'c']
  },
  tree: {
    rootIds: ['root'],
    nodes: {
      root: {
        children: ['left', 'right'],
        value: 'root'
      },
      left: {
        parentId: 'root',
        children: [],
        value: 'left'
      },
      right: {
        parentId: 'root',
        children: [],
        value: 'right'
      }
    }
  }
})

const createStructuralEngine = () => new MutationEngine<
  StructuralDoc,
  MutationIntentTable,
  MutationStructuralCanonicalOperation,
  StructuralDoc
>({
  document: createStructuralDocument(),
  normalize: (document) => document,
  createReader: (readDocument) => readDocument(),
  structures: {
    canvas: {
      kind: 'ordered',
      read: (document) => document.ordered.items,
      identify: (item) => item,
      write: (document, items) => ({
        ...document,
        ordered: {
          items: [...items]
        }
      })
    },
    outline: {
      kind: 'tree',
      read: (document) => document.tree,
      write: (document, tree) => ({
        ...document,
        tree
      })
    }
  }
})

describe('MutationEngine structural API', () => {
  test('applies ordered structural move with inverse, footprint, and structural facts', () => {
    const engine = createStructuralEngine()
    const result = engine.apply({
      type: 'structural.ordered.move',
      structure: 'canvas',
      itemId: 'c',
      to: {
        kind: 'before',
        itemId: 'b'
      }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.ordered.items).toEqual(['a', 'c', 'b'])
    expect(result.commit.delta.changes).toEqual({})
    expect(result.commit.inverse).toEqual([{
      type: 'structural.ordered.move',
      structure: 'canvas',
      itemId: 'c',
      to: {
        kind: 'after',
        itemId: 'b'
      }
    }])
    expect(result.commit.structural).toEqual([{
      kind: 'ordered',
      action: 'move',
      structure: 'canvas',
      itemId: 'c',
      from: {
        prevId: 'b'
      },
      to: {
        kind: 'before',
        itemId: 'b'
      }
    }])
    expect(result.commit.footprint).toEqual([{
      kind: 'structure',
      structure: 'canvas'
    }, {
      kind: 'structure-item',
      structure: 'canvas',
      id: 'c'
    }])
  })

  test('applies ordered structural splice as a block and expands inverse into primitive moves', () => {
    const engine = createStructuralEngine()
    const result = engine.apply({
      type: 'structural.ordered.splice',
      structure: 'canvas',
      itemIds: ['b', 'd'],
      to: {
        kind: 'start'
      }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.ordered.items).toEqual(['b', 'd', 'a', 'c'])
    expect(result.commit.inverse).toEqual([{
      type: 'structural.ordered.move',
      structure: 'canvas',
      itemId: 'a',
      to: {
        kind: 'start'
      }
    }, {
      type: 'structural.ordered.move',
      structure: 'canvas',
      itemId: 'c',
      to: {
        kind: 'after',
        itemId: 'b'
      }
    }])
    expect(result.commit.structural).toEqual([{
      kind: 'ordered',
      action: 'move',
      structure: 'canvas',
      itemId: 'b',
      from: {
        prevId: 'a',
        nextId: 'c'
      },
      to: {
        kind: 'start'
      }
    }, {
      kind: 'ordered',
      action: 'move',
      structure: 'canvas',
      itemId: 'd',
      from: {
        prevId: 'c'
      },
      to: {
        kind: 'after',
        itemId: 'b'
      }
    }])
    expect(result.commit.footprint).toEqual([{
      kind: 'structure',
      structure: 'canvas'
    }, {
      kind: 'structure-item',
      structure: 'canvas',
      id: 'b'
    }, {
      kind: 'structure-item',
      structure: 'canvas',
      id: 'd'
    }])
  })

  test('applies tree structural delete and restores from generated inverse snapshot', () => {
    const engine = createStructuralEngine()
    const deleted = engine.apply({
      type: 'structural.tree.delete',
      structure: 'outline',
      nodeId: 'left'
    })

    expect(deleted.ok).toBe(true)
    if (!deleted.ok) {
      return
    }

    expect(deleted.commit.document.tree.nodes.left).toBeUndefined()
    expect(deleted.commit.document.tree.nodes.root?.children).toEqual(['right'])
    expect(deleted.commit.delta.changes).toEqual({})
    expect(deleted.commit.structural).toEqual([{
      kind: 'tree',
      action: 'delete',
      structure: 'outline',
      nodeId: 'left',
      previousParentId: 'root',
      previousIndex: 0
    }])

    const restored = engine.apply(deleted.commit.inverse)
    expect(restored.ok).toBe(true)
    if (!restored.ok) {
      return
    }

    expect(restored.commit.document).toEqual(createStructuralDocument())
    expect(restored.commit.structural).toEqual([{
      kind: 'tree',
      action: 'restore',
      structure: 'outline',
      nodeId: 'left',
      parentId: 'root',
      index: 0
    }])
  })
})
