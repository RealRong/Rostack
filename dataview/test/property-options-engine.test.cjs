const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createGroupEngine
} = require('../.tmp/group-test-dist/index.js')

const createDocument = () => ({
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
      }
    },
    order: ['record-1', 'record-2']
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
    byId: {},
    order: []
  }
})

const getStatusOptions = engine => (
  engine.properties.get('status')?.config?.options ?? []
)

test('property option commands are resolved inside core/write and keep record values consistent', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  const createResult = engine.command({
    type: 'property.option.create',
    propertyId: 'status',
    input: {
      name: 'Blocked'
    }
  })

  assert.equal(createResult.applied, true)
  let statusOptions = getStatusOptions(engine)
  const blocked = statusOptions.find(option => option.name === 'Blocked')
  assert.ok(blocked)
  assert.equal(blocked.category, 'todo')

  const updateResult = engine.command({
    type: 'property.option.update',
    propertyId: 'status',
    optionId: blocked.id,
    patch: {
      color: ' red ',
      category: 'in_progress'
    }
  })

  assert.equal(updateResult.applied, true)
  statusOptions = getStatusOptions(engine)
  assert.deepStrictEqual(
    statusOptions.find(option => option.id === blocked.id),
    {
      ...blocked,
      color: 'red',
      category: 'in_progress'
    }
  )

  const reorderResult = engine.command({
    type: 'property.option.reorder',
    propertyId: 'status',
    optionIds: [blocked.id, 'todo']
  })

  assert.equal(reorderResult.applied, true)
  statusOptions = getStatusOptions(engine)
  assert.deepStrictEqual(
    statusOptions.map(option => option.id),
    [blocked.id, 'todo', 'done']
  )

  const removeResult = engine.command({
    type: 'property.option.remove',
    propertyId: 'status',
    optionId: 'todo'
  })

  assert.equal(removeResult.applied, true)
  assert.deepStrictEqual(
    getStatusOptions(engine).map(option => option.id),
    [blocked.id, 'done']
  )
  assert.equal(engine.records.get('record-1')?.values.status, undefined)
  assert.equal(engine.records.get('record-2')?.values.status, 'done')
})

test('property option engine facade stays thin while preserving return semantics', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  const appended = engine.properties.options.append('status')
  assert.ok(appended)
  assert.equal(appended.name, 'Option')
  assert.equal(appended.category, 'todo')

  const existing = engine.properties.options.create('status', 'Done')
  assert.equal(existing?.id, 'done')

  const updated = engine.properties.options.update('status', 'done', {
    color: ' blue '
  })
  assert.equal(updated?.color, 'blue')

  const conflicting = engine.properties.options.update('status', 'done', {
    name: 'Todo'
  })
  assert.equal(conflicting, undefined)
})
