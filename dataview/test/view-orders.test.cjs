const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createGroupEngine
} = require('../.tmp/group-test-dist/index.js')
const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')
const {
  resolveProjection
} = require('../.tmp/group-test-dist/engine/projection/view/projection.js')

const ordered = (document, viewId) => {
  const result = resolveProjection(document, viewId)
  if (!result) {
    return []
  }

  return result.sections
    .flatMap(section => section.ids)
    .flatMap(appearanceId => {
      const recordId = result.appearances.get(appearanceId)?.recordId
      const record = recordId
        ? document.records.byId[recordId]
        : undefined
      return record ? [record] : []
    })
}

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
        type: 'gallery',
        name: 'Gallery',
        ...viewPatch
      }
    },
    order: ['view-1']
  }
})

test('view.order.move stores a full manual order and read model consumes it', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  const result = engine.command({
    type: 'view.order.move',
    viewId: 'view-1',
    recordIds: ['record-3'],
    beforeRecordId: 'record-1'
  })

  assert.equal(result.applied, true)
  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].orders,
    ['record-3', 'record-1', 'record-2']
  )
  assert.deepStrictEqual(
    ordered(engine.document.export(), 'view-1').map(record => record.id),
    ['record-3', 'record-1', 'record-2']
  )
})

test('view.order.move is rejected while sorters are active', () => {
  const engine = createGroupEngine({
    document: createDocument({
      query: {
        search: {
          query: ''
        },
        filter: {
          mode: 'and',
          rules: []
        },
        sorters: [{
          property: 'title',
          direction: 'asc'
        }]
      }
    })
  })

  const result = engine.command({
    type: 'view.order.move',
    viewId: 'view-1',
    recordIds: ['record-3'],
    beforeRecordId: 'record-1'
  })

  assert.equal(result.applied, false)
  assert.equal(result.issues[0]?.code, 'view.manualOrderUnavailable')
  assert.deepStrictEqual(engine.document.export().views.byId['view-1'].orders, [])
})

test('record.remove cleans removed ids from view.orders', () => {
  const engine = createGroupEngine({
    document: createDocument({
      orders: ['record-2', 'record-1', 'record-3']
    })
  })

  const result = engine.command({
    type: 'record.remove',
    recordIds: ['record-2']
  })

  assert.equal(result.applied, true)
  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].orders,
    ['record-1', 'record-3']
  )
})

test('engine.view(viewId).order.move writes manual order', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.view('view-1').order.move(['record-2', 'record-3'], 'record-1')

  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].orders,
    ['record-2', 'record-3', 'record-1']
  )
})

test('engine.view(viewId).order.clear clears manual order', () => {
  const engine = createGroupEngine({
    document: createDocument({
      orders: ['record-2', 'record-1', 'record-3']
    })
  })

  engine.view('view-1').order.clear()

  assert.deepStrictEqual(engine.document.export().views.byId['view-1'].orders, [])
})

test('engine.view(viewId).query exposes bound query actions', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.view('view-1').query.addSorter('title', 'desc')

  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].query.sorters,
    [{
      property: 'title',
      direction: 'desc'
    }]
  )
})

test('engine.view(viewId).settings exposes direct section actions', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.view('view-1').settings.display.setPropertyIds(['title', 'status'])

  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].options.display.propertyIds,
    ['title', 'status']
  )
})

test('engine.view(viewId).kanban.createCard uses grouped column semantics without view board runtime', () => {
  const engine = createGroupEngine({
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
          properties: {},
          newRecordPosition: 'start'
        }
      }
    })
  })

  const recordId = engine.view('view-1').kanban.createCard({
    groupKey: 'todo',
    title: 'Delta'
  })

  assert.equal(typeof recordId, 'string')
  assert.deepStrictEqual(
    engine.records.get(recordId)?.values,
    {
      title: 'Delta',
      status: 'todo'
    }
  )
  assert.equal(
    engine.document.export().views.byId['view-1'].orders[0],
    recordId
  )
})

test('engine.view(viewId).kanban.moveCards updates group value and manual order', () => {
  const engine = createGroupEngine({
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

  engine.view('view-1').kanban.moveCards({
    recordIds: ['record-2'],
    groupKey: 'todo',
    beforeRecordId: 'record-1'
  })

  assert.equal(engine.records.get('record-2')?.values.status, 'todo')
  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].orders,
    ['record-2', 'record-1', 'record-3']
  )
})
