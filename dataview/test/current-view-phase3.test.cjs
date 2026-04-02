const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')
const {
  createCurrentViewHarness
} = require('./helpers/current-view-harness.cjs')

const createDocument = (viewPatch = {}) => normalizeGroupDocument({
  schemaVersion: 1,
  records: {
    byId: {
      'record-1': {
        id: 'record-1',
        values: {
          title: 'Alpha',
          status: 'todo'
        }
      },
      'record-2': {
        id: 'record-2',
        values: {
          title: 'Beta',
          status: 'done'
        }
      },
      'record-3': {
        id: 'record-3',
        values: {
          title: 'Gamma',
          status: 'todo'
        }
      }
    },
    order: ['record-1', 'record-2', 'record-3']
  },
  properties: {
    byId: {
      title: {
        id: 'title',
        name: 'Title',
        kind: 'text',
        config: {
          type: 'text'
        }
      },
      status: {
        id: 'status',
        name: 'Status',
        kind: 'status',
        config: {
          type: 'status',
          options: [
            {
              id: 'todo',
              key: 'todo',
              name: 'Todo',
              category: 'todo'
            },
            {
              id: 'done',
              key: 'done',
              name: 'Done',
              category: 'complete'
            }
          ]
        }
      }
    },
    order: ['title', 'status']
  },
  views: {
    byId: {
      'view-1': {
        id: 'view-1',
        name: 'View',
        type: 'gallery',
        ...viewPatch
      }
    },
    order: ['view-1']
  }
})

const recordIdsOf = (currentView, ids) => {
  const seen = new Set()

  return ids.flatMap(id => {
    const recordId = currentView?.appearances.get(id)?.recordId
    if (!recordId || seen.has(recordId)) {
      return []
    }

    seen.add(recordId)
    return [recordId]
  })
}

const sectionRecordIds = (currentView, sectionKey) => (
  recordIdsOf(
    currentView,
    currentView?.sections.find(section => section.key === sectionKey)?.ids ?? []
  )
)

test('current view store exposes a read-only selection store and commands', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  const currentView = harness.currentView.get()

  assert.equal(typeof currentView?.selection.set, 'undefined')
  assert.equal(typeof currentView?.commands.selection.set, 'function')
  assert.equal(typeof currentView?.commands.move.selection, 'function')
  assert.equal(typeof currentView?.commands.move.ids, 'function')
  assert.equal(typeof currentView?.commands.mutation.create, 'function')
  assert.equal(typeof currentView?.commands.mutation.remove, 'function')

  harness.dispose()
})

test('current view commands.move.ids reorders flat view by appearance ids', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  const currentView = harness.currentView.get()
  const rootSection = currentView?.sections[0]?.key
  const firstId = currentView?.appearances.ids[0]
  const lastId = currentView?.appearances.ids[2]

  assert.equal(typeof rootSection, 'string')
  assert.equal(typeof firstId, 'string')
  assert.equal(typeof lastId, 'string')

  currentView?.commands.move.ids(
    lastId ? [lastId] : [],
    {
      section: rootSection,
      before: firstId
    }
  )

  const nextView = harness.currentView.get()

  assert.deepStrictEqual(
    recordIdsOf(nextView, nextView?.appearances.ids ?? []),
    ['record-3', 'record-1', 'record-2']
  )

  harness.dispose()
})

test('current view commands.move.selection updates grouped section and order atomically', () => {
  const harness = createCurrentViewHarness({
    document: createDocument({
      type: 'kanban',
      query: {
        group: {
          property: 'status',
          mode: 'option',
          bucketSort: 'manual'
        }
      }
    })
  })

  const currentView = harness.currentView.get()
  const todoId = currentView?.sections.find(section => section.key === 'todo')?.ids[0]
  const doneId = currentView?.sections.find(section => section.key === 'done')?.ids[0]

  currentView?.commands.selection.set(doneId ? [doneId] : [])
  currentView?.commands.move.selection({
    section: 'todo',
    before: todoId
  })

  const nextView = harness.currentView.get()

  assert.equal(harness.engine.records.get('record-2')?.values.status, 'todo')
  assert.deepStrictEqual(
    sectionRecordIds(nextView, 'todo'),
    ['record-2', 'record-1', 'record-3']
  )

  harness.dispose()
})

test('current view commands.mutation.create creates a record in section with start insert semantics', () => {
  const harness = createCurrentViewHarness({
    document: createDocument({
      type: 'kanban',
      query: {
        group: {
          property: 'status',
          mode: 'option',
          bucketSort: 'manual'
        }
      },
      options: {
        display: {
          propertyIds: ['title']
        },
        table: {
          widths: {}
        },
        gallery: {
          showPropertyLabels: true,
          cardSize: 'md'
        },
        kanban: {
          newRecordPosition: 'start'
        }
      }
    })
  })

  const currentView = harness.currentView.get()
  const recordId = currentView?.commands.mutation.create('todo', {
    title: 'Delta'
  })
  const nextView = harness.currentView.get()

  assert.equal(typeof recordId, 'string')
  assert.deepStrictEqual(
    harness.engine.records.get(recordId)?.values,
    {
      title: 'Delta',
      status: 'todo'
    }
  )
  assert.equal(
    sectionRecordIds(nextView, 'todo')[0],
    recordId
  )

  harness.dispose()
})

test('current view commands.mutation.remove deletes the current selection', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  const currentView = harness.currentView.get()
  const targetId = currentView?.appearances.ids[1]

  currentView?.commands.selection.set(targetId ? [targetId] : [])
  currentView?.commands.mutation.remove()

  const nextView = harness.currentView.get()

  assert.equal(harness.engine.records.get('record-2'), undefined)
  assert.deepStrictEqual(
    recordIdsOf(nextView, nextView?.appearances.ids ?? []),
    ['record-1', 'record-3']
  )
  assert.deepStrictEqual(nextView?.selection.get().ids, [])

  harness.dispose()
})
