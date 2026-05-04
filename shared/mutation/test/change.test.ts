import {
  describe,
  expect,
  test
} from 'vitest'
import {
  change,
  field,
  schema,
  sequence,
  table,
  tree,
  writer
} from '../src/index'

const mutationSchema = schema({
  activeViewId: field<string | undefined>(),
  prefs: {
    theme: field<'light' | 'dark'>()
  },
  views: table({
    name: field<string>(),
    order: sequence<string>(),
    meta: {
      note: field<string | undefined>(),
      tags: sequence<string>()
    }
  }),
  mindmaps: table({
    tree: tree<string, {
      label?: string
      side?: 'left' | 'right'
    }>()
  })
})

describe('MutationChange', () => {
  test('uses indexed change queries for fields, entities, sequences and trees', () => {
    const writes = [] as import('../src').MutationWrite[]
    const write = writer(mutationSchema, writes)

    write.activeViewId.set('view-1')
    write.views.create('view-2', {
      name: 'Second',
      order: [],
      meta: {
        note: undefined,
        tags: []
      }
    })
    write.views('view-1').name.set('Updated')
    write.views('view-1').order.insert('b')
    write.views('view-1').meta.tags.insert('urgent')
    write.mindmaps.create('mindmap-1', {
      tree: {
        rootId: undefined,
        nodes: {}
      }
    })
    write.mindmaps('mindmap-1').tree.insert('root', {
      value: {
        label: 'Root'
      }
    })
    write.mindmaps('mindmap-1').tree.patch('root', {
      side: 'right'
    })
    write.views.remove('view-3')

    const changes = change(mutationSchema, writes)

    expect(changes.reset()).toBe(false)
    expect(changes.activeViewId.changed()).toBe(true)
    expect(changes.prefs.theme.changed()).toBe(false)

    expect(changes.views.changed()).toBe(true)
    expect(changes.views.created('view-2')).toBe(true)
    expect(changes.views.removed('view-3')).toBe(true)
    expect(changes.views.created('view-1')).toBe(false)

    expect(changes.views('view-1').changed()).toBe(true)
    expect(changes.views('view-1').name.changed()).toBe(true)
    expect(changes.views('view-1').order.changed()).toBe(true)
    expect(changes.views('view-1').order.changed('b')).toBe(true)
    expect(changes.views('view-1').order.changed('missing')).toBe(false)
    expect(changes.views('view-1').meta.note.changed()).toBe(false)
    expect(changes.views('view-1').meta.tags.changed()).toBe(true)
    expect(changes.views('view-1').meta.tags.changed('urgent')).toBe(true)

    expect(changes.mindmaps.created('mindmap-1')).toBe(true)
    expect(changes.mindmaps('mindmap-1').changed()).toBe(true)
    expect(changes.mindmaps('mindmap-1').tree.changed()).toBe(true)
    expect(changes.mindmaps('mindmap-1').tree.changed('root')).toBe(true)
    expect(changes.mindmaps('mindmap-1').tree.changed('missing')).toBe(false)
  })

  test('marks replace changes as reset', () => {
    const changes = change(mutationSchema, [], {
      reset: true
    })

    expect(changes.reset()).toBe(true)
    expect(changes.activeViewId.changed()).toBe(true)
    expect(changes.views.changed()).toBe(true)
    expect(changes.views('view-1').changed()).toBe(true)
    expect(changes.views.created('view-1')).toBe(false)
    expect(changes.views.removed('view-1')).toBe(false)
    expect(changes.mindmaps('mindmap-1').tree.changed('root')).toBe(true)
  })
})
