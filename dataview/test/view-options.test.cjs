const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createDefaultGroupViewOptions,
  createGroupEngine,
  prunePropertyFromViewOptions
} = require('../.tmp/group-test-dist/index.js')
const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')

const createDocument = (viewPatch = {}) => ({
  schemaVersion: 1,
  records: {
    byId: {},
    order: []
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
        kind: 'text',
        config: {
          type: 'text'
        }
      }
    },
    order: ['title', 'status']
  },
  views: {
    byId: {
      'view-1': {
        id: 'view-1',
        type: 'table',
        name: 'Table',
        ...viewPatch
      }
    },
    order: ['view-1']
  }
})

test('createDefaultGroupViewOptions materializes table defaults', () => {
  const document = normalizeGroupDocument(createDocument())

  assert.deepStrictEqual(
    createDefaultGroupViewOptions('table', Object.values(document.properties.byId)),
    {
      display: {
        propertyIds: ['title', 'status']
      },
      table: {
        widths: {}
      },
      gallery: {
        showPropertyLabels: true,
        cardSize: 'md'
      },
      kanban: {
        newRecordPosition: 'end'
      }
    }
  )
})

test('createDefaultGroupViewOptions materializes title-only defaults for non-table views', () => {
  const document = normalizeGroupDocument(createDocument())

  assert.deepStrictEqual(
    createDefaultGroupViewOptions('gallery', Object.values(document.properties.byId)),
    {
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
        newRecordPosition: 'end'
      }
    }
  )
})

test('prunePropertyFromViewOptions removes display ids and table widths', () => {
  assert.deepStrictEqual(
    prunePropertyFromViewOptions({
      display: {
        propertyIds: ['title', 'status']
      },
      table: {
        widths: {
          status: 120
        }
      },
      gallery: {
        showPropertyLabels: true,
        cardSize: 'md'
      },
      kanban: {
        newRecordPosition: 'end'
      }
    }, 'status'),
    {
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
        newRecordPosition: 'end'
      }
    }
  )
})

test('normalizeGroupDocument materializes view display defaults once at the helper boundary', () => {
  const document = normalizeGroupDocument(createDocument())

  assert.deepStrictEqual(
    document.views.byId['view-1'].options,
    {
      display: {
        propertyIds: ['title', 'status']
      },
      table: {
        widths: {}
      },
      gallery: {
        showPropertyLabels: true,
        cardSize: 'md'
      },
      kanban: {
        newRecordPosition: 'end'
      }
    }
  )
})

test('normalizeGroupDocument canonicalizes raw view options once at the helper boundary', () => {
  const document = normalizeGroupDocument(createDocument({
    options: {
      display: {
        propertyIds: [' status ', 'status', '']
      },
      table: {
        widths: {
          ' status ': 120,
          title: -1
        }
      },
      gallery: {
        cardSize: 'xl'
      },
      kanban: {
        newRecordPosition: 'start'
      },
      custom: {
        flag: true
      }
    }
  }))

  assert.deepStrictEqual(
    document.views.byId['view-1'].options,
    {
      display: {
        propertyIds: ['status']
      },
      table: {
        widths: {
          status: 120
        }
      },
      gallery: {
        showPropertyLabels: true,
        cardSize: 'md'
      },
      kanban: {
        newRecordPosition: 'start'
      }
    }
  )
})

test('view.create materializes table display defaults at the create boundary', () => {
  const engine = createGroupEngine({
    document: normalizeGroupDocument({
      ...createDocument(),
      views: {
        byId: {},
        order: []
      }
    })
  })

  const result = engine.command({
    type: 'view.create',
    input: {
      name: 'Table',
      type: 'table'
    }
  })

  const createdViewId = result.created?.views?.[0]
  assert.equal(typeof createdViewId, 'string')
  assert.deepStrictEqual(
    engine.document.export().views.byId[createdViewId].options,
    {
      display: {
        propertyIds: ['title', 'status']
      },
      table: {
        widths: {}
      },
      gallery: {
        showPropertyLabels: true,
        cardSize: 'md'
      },
      kanban: {
        newRecordPosition: 'end'
      }
    }
  )
})
