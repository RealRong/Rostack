const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')
const {
  resolvePageState
} = require('../.tmp/group-test-dist/react/page/state/resolved.js')

const createDocument = () => normalizeGroupDocument({
  schemaVersion: 1,
  records: {
    byId: {
      'record-1': {
        id: 'record-1',
        values: {
          title: 'Alpha'
        }
      }
    },
    order: ['record-1']
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
        name: 'Table',
        type: 'table'
      }
    },
    order: ['view-1']
  }
})

const createPageSession = () => ({
  activeViewId: 'view-1',
  query: {
    visible: true,
    route: null
  },
  settings: {
    visible: false,
    route: {
      kind: 'root'
    }
  }
})

test('resolved page state exposes valueEditorOpen through public state', () => {
  const state = resolvePageState(
    createDocument(),
    createPageSession(),
    true
  )

  assert.equal(state.valueEditorOpen, true)
  assert.equal(state.lock, 'value-editor')
})

test('resolved page state leaves lock empty when the value editor is closed', () => {
  const state = resolvePageState(
    createDocument(),
    createPageSession(),
    false
  )

  assert.equal(state.valueEditorOpen, false)
  assert.equal(state.lock, null)
})
