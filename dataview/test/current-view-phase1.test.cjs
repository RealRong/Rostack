const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')
const {
  createCurrentViewHarness
} = require('./helpers/current-view-harness.cjs')

const createDocument = () => normalizeGroupDocument({
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
        name: 'Table',
        type: 'table'
      },
      'view-2': {
        id: 'view-2',
        name: 'Board',
        type: 'kanban',
        query: {
          group: {
            property: 'status',
            mode: 'option',
            bucketSort: 'manual'
          }
        }
      }
    },
    order: ['view-1', 'view-2']
  }
})

test('current view store exposes phase 1 projection', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  const currentView = harness.currentView.get()

  assert.equal(currentView?.view.id, 'view-1')
  assert.equal(currentView?.view.type, 'table')
  assert.deepStrictEqual(
    currentView?.appearances.ids,
    [
      'section:root\u0000record:record-1\u0000slot:0',
      'section:root\u0000record:record-2\u0000slot:0',
      'section:root\u0000record:record-3\u0000slot:0'
    ]
  )
  assert.equal(currentView?.schema.properties.get('title')?.name, 'Title')
  assert.equal(
    currentView?.appearances.get('section:root\u0000record:record-2\u0000slot:0')?.recordId,
    'record-2'
  )

  harness.dispose()
})

test('current view store keeps selection while the same view document changes', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  const currentView = harness.currentView.get()
  const targetId = currentView?.appearances.ids[1]

  currentView?.commands.selection.set(targetId ? [targetId] : [])

  harness.engine.records.setValue('record-1', 'title', 'Updated')

  const nextView = harness.currentView.get()

  assert.equal(nextView?.view.id, 'view-1')
  assert.deepStrictEqual(nextView?.selection.get().ids, targetId ? [targetId] : [])

  harness.dispose()
})

test('current view store follows active view switching', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  harness.page.setActiveViewId('view-2')

  const currentView = harness.currentView.get()

  assert.equal(currentView?.view.id, 'view-2')
  assert.equal(currentView?.view.type, 'kanban')
  assert.deepStrictEqual(
    currentView?.sections.map(section => section.key),
    ['todo', 'done', '(empty)']
  )

  harness.dispose()
})
