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
          title: 'Alpha'
        }
      },
      'record-2': {
        id: 'record-2',
        values: {
          title: 'Beta'
        }
      },
      'record-3': {
        id: 'record-3',
        values: {
          title: 'Gamma'
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
      }
    },
    order: ['title']
  },
  views: {
    byId: {
      'view-1': {
        id: 'view-1',
        name: 'View',
        type: 'table'
      }
    },
    order: ['view-1']
  }
})

test('current view commands.selection.set preserves explicit anchor and focus', () => {
  const harness = createCurrentViewHarness({
    document: createDocument()
  })

  const currentView = harness.currentView.get()
  const firstId = currentView?.appearances.ids[0]
  const secondId = currentView?.appearances.ids[1]

  currentView?.commands.selection.set(
    firstId && secondId ? [firstId, secondId] : [],
    {
      anchor: secondId,
      focus: firstId
    }
  )

  const next = harness.currentView.get()?.selection.get()

  assert.deepStrictEqual(next, {
    ids: [firstId, secondId],
    anchor: secondId,
    focus: firstId
  })

  harness.dispose()
})
