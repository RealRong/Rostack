import {
  describe,
  expect,
  test
} from 'vitest'
import {
  applyMutationWrites,
  dictionary,
  field,
  schema,
  sequence,
  table,
  tree,
  writer
} from '../src/index'

const boardSchema = schema({
  activeViewId: field<string | undefined>(),
  prefs: {
    theme: field<'light' | 'dark'>()
  },
  views: table({
    name: field<string>(),
    order: sequence<string>(),
    meta: dictionary<string, unknown>()
  }),
  mindmaps: table({
    tree: tree<string, {
      side?: 'left' | 'right'
      label?: string
    }>()
  })
})

describe('applyMutationWrites', () => {
  test('applies writes with lazy COW and restores through inverse writes', () => {
    const document = {
      activeViewId: undefined,
      prefs: {
        theme: 'light' as const
      },
      views: {
        ids: ['a', 'b'],
        byId: {
          a: {
            name: 'Alpha',
            order: ['1'],
            meta: {
              color: 'blue'
            }
          },
          b: {
            name: 'Beta',
            order: [],
            meta: {}
          }
        }
      },
      mindmaps: {
        ids: [],
        byId: {}
      }
    }

    const writes = [] as import('../src').MutationWrite[]
    const write = writer(boardSchema, writes)

    write.activeViewId.set('a')
    write.views('a').name.set('Alpha 2')
    write.views('a').meta.set('status', 'active')
    write.views('a').order.insert('2', { after: '1' })
    write.views.move('b', { before: 'a' })

    const applied = applyMutationWrites(boardSchema, document, writes)

    expect(applied.document.activeViewId).toBe('a')
    expect(applied.document.views.byId.a?.name).toBe('Alpha 2')
    expect(applied.document.views.byId.a?.meta).toEqual({
      color: 'blue',
      status: 'active'
    })
    expect(applied.document.views.byId.a?.order).toEqual(['1', '2'])
    expect(applied.document.views.ids).toEqual(['b', 'a'])

    expect(applied.document.prefs).toBe(document.prefs)
    expect(applied.document.views).not.toBe(document.views)
    expect(applied.document.views.byId.a).not.toBe(document.views.byId.a)

    const restored = applyMutationWrites(boardSchema, applied.document, applied.inverse)
    expect(restored.document).toEqual(document)
  })

  test('applies tree writes and restores through inverse replace', () => {
    const document = {
      activeViewId: undefined,
      prefs: {
        theme: 'light' as const
      },
      views: {
        ids: [],
        byId: {}
      },
      mindmaps: {
        ids: ['m1'],
        byId: {
          m1: {
            tree: {
              rootId: undefined,
              nodes: {}
            }
          }
        }
      }
    }

    const writes = [] as import('../src').MutationWrite[]
    const write = writer(boardSchema, writes)

    write.mindmaps('m1').tree.insert('root', {
      value: {
        side: 'right',
        label: 'Root'
      }
    })
    write.mindmaps('m1').tree.insert('child', {
      parentId: 'root',
      index: 0,
      value: {
        label: 'Child'
      }
    })
    write.mindmaps('m1').tree.patch('child', {
      side: 'left'
    })
    write.mindmaps('m1').tree.move('child', {
      parentId: undefined,
      index: 0
    })

    const applied = applyMutationWrites(boardSchema, document, writes)
    const treeState = applied.document.mindmaps.byId.m1?.tree

    expect(treeState?.rootId).toBe('child')
    expect(treeState?.nodes.root.value).toEqual({
      side: 'right',
      label: 'Root'
    })
    expect(treeState?.nodes.child.value).toEqual({
      label: 'Child',
      side: 'left'
    })
    expect(treeState?.nodes.child.parentId).toBeUndefined()

    const restored = applyMutationWrites(boardSchema, applied.document, applied.inverse)
    expect(restored.document).toEqual(document)
  })
})
