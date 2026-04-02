const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createGroupEngine
} = require('../.tmp/group-test-dist/index.js')
const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')

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
        name: 'Table',
        type: 'table'
      }
    },
    order: ['view-1']
  }
})

test('engine history exposes undo and redo state directly', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  assert.equal(engine.history.canUndo(), false)
  assert.equal(engine.history.canRedo(), false)

  engine.records.setValue('record-1', 'title', 'Updated')

  assert.equal(engine.history.canUndo(), true)
  assert.equal(engine.history.state().undoDepth, 1)

  engine.history.undo()

  assert.equal(engine.read.record.get('record-1')?.values.title, 'Alpha')
  assert.equal(engine.history.canRedo(), true)
  assert.equal(engine.history.state().redoDepth, 1)
})

test('engine records.removeMany batches record removal into a single undo step', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.records.removeMany(['record-1', 'record-2'])

  assert.deepStrictEqual(
    engine.read.document.get().records.order,
    ['record-3']
  )
  assert.equal(engine.history.state().undoDepth, 1)

  engine.history.undo()

  assert.deepStrictEqual(
    engine.read.document.get().records.order,
    ['record-1', 'record-2', 'record-3']
  )
})
