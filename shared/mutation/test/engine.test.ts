import { describe, expect, test } from 'vitest'
import {
  MutationEngine,
  collection,
  defineMutationSchema,
  object,
  sequence,
  singleton,
  tree,
  value,
  type MutationProgramStep,
  type MutationTreeSnapshot
} from '@shared/mutation'
import type {
  MutationCurrent,
  MutationIntent
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

type TestIntent =
  | {
      type: 'item.add'
      id: ItemId
      title: string
    }
  | {
      type: 'item.open'
      id: ItemId
    }

const writeItemTable = (
  document: TestDoc,
  nextById: Readonly<Record<string, unknown>>
): TestDoc => {
  const nextIds = document.items.ids.filter((id) => nextById[id] !== undefined)
  const seen = new Set(nextIds)

  Object.keys(nextById).forEach((id) => {
    if (seen.has(id as ItemId)) {
      return
    }

    nextIds.push(id as ItemId)
    seen.add(id as ItemId)
  })

  return {
    ...document,
    items: {
      ids: nextIds,
      byId: nextById as TestDoc['items']['byId']
    }
  }
}

const testMutationSchema = defineMutationSchema<TestDoc>()({
  document: singleton<TestDoc, TestDoc>()({
    access: {
      read: (document) => document,
      write: (_document, next) => next as TestDoc
    },
    members: {
      activeItemId: value<TestDoc['activeItemId']>()
    },
    changes: ({ value }) => ({
      activeItemId: [value('activeItemId')]
    })
  }),
  item: collection<TestDoc, ItemId, Item>()({
    access: {
      read: (document) => document.items.byId,
      write: (document, next) => writeItemTable(
        document,
        next as Readonly<Record<string, unknown>>
      )
    },
    members: {
      title: value<Item['title']>()
    },
    changes: ({ value }) => ({
      title: [value('title')]
    })
  })
})

const createDocument = (): TestDoc => ({
  items: {
    ids: [],
    byId: {}
  },
  activeItemId: undefined
})

const createEngine = () => new MutationEngine<
  TestDoc,
  TestIntent,
  import('@shared/mutation').MutationReader<typeof testMutationSchema>
>({
  schema: testMutationSchema,
  document: createDocument(),
  normalize: (document) => document,
  compile: {
    handlers: {
      'item.add': ({ intent, writer }) => {
        writer.item.create({
          id: intent.id,
          title: intent.title
        })
        return intent.id
      },
      'item.open': ({ intent, writer }) => {
        writer.document.patch({
          activeItemId: intent.id
        })
        return intent.id
      }
    }
  }
})

describe('MutationEngine current API', () => {
  test('applies mutation program steps and emits watch/commit updates', () => {
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
      steps: [{
        type: 'entity.create',
        entity: {
          kind: 'entity',
          type: 'item',
          id: 'item_1'
        },
        value: {
          id: 'item_1',
          title: 'First'
        }
      }]
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
    expect(result.commit.inverse).toEqual({
      steps: [{
        type: 'entity.delete',
        entity: {
          kind: 'entity',
          type: 'item',
          id: 'item_1'
        }
      }]
    })
    expect(Boolean(result.commit.delta.changes['item.create'])).toBe(true)
    expect(commits).toEqual(['apply'])
    expect(snapshots).toEqual([{
      rev: 1,
      document: result.commit.document
    }])
    expect(engine.history.get().undoDepth).toBe(1)
    expect(engine.reader().item.get('item_1')).toEqual({
      id: 'item_1',
      title: 'First'
    })
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
      steps: [{
        type: 'entity.create',
        entity: {
          kind: 'entity',
          type: 'item',
          id: 'item_1'
        },
        value: {
          id: 'item_1',
          title: 'First'
        }
      }]
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
  cards: {
    items: {
      id: string
      title: string
      meta?: {
        color?: string
      }
    }[]
  }
  tree: MutationTreeSnapshot<string>
  stateTree: MutationTreeSnapshot<{
    collapsed?: boolean
    branchStyle: {
      color: string
    }
  }>
}

const createStructuralDocument = (): StructuralDoc => ({
  ordered: {
    items: ['a', 'b', 'c']
  },
  cards: {
    items: [{
      id: 'card_a',
      title: 'A',
      meta: {
        color: 'red'
      }
    }, {
      id: 'card_b',
      title: 'B',
      meta: {
        color: 'blue'
      }
    }]
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
  },
  stateTree: {
    rootIds: ['root'],
    nodes: {
      root: {
        children: ['child'],
        value: {
          branchStyle: {
            color: 'black'
          }
        }
      },
      child: {
        parentId: 'root',
        children: [],
        value: {
          collapsed: false,
          branchStyle: {
            color: 'green'
          }
        }
      }
    }
  }
})

const structuralMutationSchema = defineMutationSchema<StructuralDoc>()({
  order: singleton<StructuralDoc, StructuralDoc['ordered']>()({
    access: {
      read: (document) => document.ordered,
      write: (document, next) => ({
        ...document,
        ordered: next as StructuralDoc['ordered']
      })
    },
    members: {
      items: object<readonly string[]>()
    },
    sequence: {
      items: sequence<string>()({
        read: (document) => document.ordered.items,
        write: (document, items) => ({
          ...document,
          ordered: {
            items: [...items]
          }
        }),
        identify: (item) => item,
        emits: 'items'
      })
    }
  }),
  cards: singleton<StructuralDoc, StructuralDoc['cards']>()({
    access: {
      read: (document) => document.cards,
      write: (document, next) => ({
        ...document,
        cards: next as StructuralDoc['cards']
      })
    },
    members: {
      items: object<StructuralDoc['cards']['items']>()
    },
    sequence: {
      items: sequence<StructuralDoc['cards']['items'][number]>()({
        read: (document) => document.cards.items,
        write: (document, items) => ({
          ...document,
          cards: {
            items: items.map((item) => structuredClone(item))
          }
        }),
        identify: (item) => item.id,
        emits: 'items'
      })
    }
  }),
  outline: singleton<StructuralDoc, MutationTreeSnapshot<string>>()({
    access: {
      read: (document) => document.tree,
      write: (document, next) => ({
        ...document,
        tree: next as MutationTreeSnapshot<string>
      })
    },
    members: {},
    tree: {
      nodes: tree<string>()({
        read: (document) => document.tree,
        write: (document, next) => ({
          ...document,
          tree: next
        }),
        emits: 'nodes'
      })
    }
  }),
  stateTree: singleton<StructuralDoc, StructuralDoc['stateTree']>()({
    access: {
      read: (document) => document.stateTree,
      write: (document, next) => ({
        ...document,
        stateTree: next as StructuralDoc['stateTree']
      })
    },
    members: {},
    tree: {
      nodes: tree<StructuralDoc['stateTree']['nodes'][string]['value']>()({
        read: (document) => document.stateTree,
        write: (document, next) => ({
          ...document,
          stateTree: next
        }),
        emits: 'nodes'
      })
    }
  })
})

const createStructuralEngine = (
  document: StructuralDoc = createStructuralDocument()
) => new MutationEngine<
  StructuralDoc,
  MutationIntent,
  import('@shared/mutation').MutationReader<typeof structuralMutationSchema>
>({
  schema: structuralMutationSchema,
  document,
  normalize: (next) => next
})

describe('MutationEngine structural API', () => {
  test('applies ordered structural move with inverse and structural facts', () => {
    const engine = createStructuralEngine()
    const result = engine.apply({
      steps: [{
        type: 'ordered.move',
        target: {
          kind: 'ordered',
          type: 'order.items'
        },
        itemId: 'c',
        to: {
          kind: 'before',
          itemId: 'b'
        }
      }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.ordered.items).toEqual(['a', 'c', 'b'])
    expect(result.commit.inverse).toEqual({
      steps: [{
        type: 'ordered.move',
        target: {
          kind: 'ordered',
          type: 'order.items'
        },
        itemId: 'c',
        to: {
          kind: 'after',
          itemId: 'b'
        }
      }]
    })
    expect(result.commit.structural).toEqual([{
      kind: 'ordered',
      action: 'move',
      structure: 'order.items',
      itemId: 'c',
      from: {
        prevId: 'b'
      },
      to: {
        kind: 'before',
        itemId: 'b'
      }
    }])
  })

  test('applies ordered patch and computes inverse patch from sequence item diff', () => {
    const engine = createStructuralEngine()
    const result = engine.apply({
      steps: [{
        type: 'ordered.patch',
        target: {
          kind: 'ordered',
          type: 'cards.items'
        },
        itemId: 'card_b',
        patch: {
          meta: {
            color: 'purple'
          }
        }
      }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.cards.items[1]?.meta?.color).toBe('purple')
    expect(result.commit.inverse).toEqual({
      steps: [{
        type: 'ordered.patch',
        target: {
          kind: 'ordered',
          type: 'cards.items'
        },
        itemId: 'card_b',
        patch: {
          'meta.color': 'blue'
        }
      }]
    })
  })

  test('applies tree delete and restores subtree through inverse', () => {
    const engine = createStructuralEngine()
    const result = engine.apply({
      steps: [{
        type: 'tree.delete',
        target: {
          kind: 'tree',
          type: 'outline.nodes'
        },
        nodeId: 'left'
      }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.tree.nodes.left).toBeUndefined()
    expect(result.commit.inverse.steps[0]?.type).toBe('tree.restore')
    expect(result.commit.structural).toEqual([{
      kind: 'tree',
      action: 'delete',
      structure: 'outline.nodes',
      nodeId: 'left',
      previousParentId: 'root',
      previousIndex: 0
    }])
  })

  test('applies tree node patch and emits inverse patch', () => {
    const engine = createStructuralEngine()
    const result = engine.apply({
      steps: [{
        type: 'tree.node.patch',
        target: {
          kind: 'tree',
          type: 'stateTree.nodes'
        },
        nodeId: 'child',
        patch: {
          collapsed: true,
          branchStyle: {
            color: 'orange'
          }
        }
      }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.commit.document.stateTree.nodes.child?.value).toEqual({
      collapsed: true,
      branchStyle: {
        color: 'orange'
      }
    })
    expect(result.commit.inverse).toEqual({
      steps: [{
        type: 'tree.node.patch',
        target: {
          kind: 'tree',
          type: 'stateTree.nodes'
        },
        nodeId: 'child',
        patch: {
          collapsed: false,
          'branchStyle.color': 'green'
        }
      }]
    })
  })
})
