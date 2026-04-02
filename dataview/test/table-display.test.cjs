const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createGroupEngine
} = require('../.tmp/group-test-dist/index.js')
const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')

const currentViewFor = (document, viewId) => {
  const engine = createGroupEngine({
    document
  })
  return engine.read.viewProjection.get(viewId)
}

const resolveSections = (document, viewId) => currentViewFor(document, viewId)?.sections ?? []
const resolveRowIds = (document, viewId) => currentViewFor(document, viewId)?.appearances.ids ?? []
const resolveRows = (document, viewId) => {
  const currentView = currentViewFor(document, viewId)
  if (!currentView) {
    return []
  }

  return currentView.appearances.ids.map(id => ({
    id,
    recordId: currentView.appearances.get(id)?.recordId,
    section: currentView.appearances.sectionOf(id)
  }))
}

const createDocument = () => ({
  schemaVersion: 1,
  records: {
    byId: {
      'record-1': {
        id: 'record-1',
        values: {
          'field-tags': ['tag-red', 'tag-blue']
        }
      },
      'record-2': {
        id: 'record-2',
        values: {
          'field-tags': ['tag-blue']
        }
      },
      'record-3': {
        id: 'record-3',
        values: {
          'field-tags': []
        }
      }
    },
    order: ['record-1', 'record-2', 'record-3']
  },
  properties: {
    byId: {
      'field-tags': {
        id: 'field-tags',
        key: 'tags',
        name: 'Tags',
        kind: 'multiSelect',
        config: {
          type: 'multiSelect',
          options: [
            {
              id: 'tag-red',
              key: 'red',
              name: 'Red'
            },
            {
              id: 'tag-blue',
              key: 'blue',
              name: 'Blue'
            },
            {
              id: 'tag-green',
              key: 'green',
              name: 'Green'
            }
          ]
        }
      }
    },
    order: ['field-tags']
  },
  views: {
    byId: {
      'view-1': {
        id: 'view-1',
        type: 'table',
        name: 'Table',
        query: {
          group: {
            property: 'field-tags'
          }
        }
      }
    },
    order: ['view-1']
  }
})

test('table grouped model resolves sections and visible record rows', () => {
  const document = normalizeGroupDocument(createDocument())

  assert.deepStrictEqual(
    resolveRows(document, 'view-1').map(row => ({
      id: row.id,
      recordId: row.recordId,
      groupKey: row.section
    })),
    [
      {
        id: 'section:tag-red\u0000record:record-1\u0000slot:0',
        recordId: 'record-1',
        groupKey: 'tag-red'
      },
      {
        id: 'section:tag-blue\u0000record:record-1\u0000slot:0',
        recordId: 'record-1',
        groupKey: 'tag-blue'
      },
      {
        id: 'section:tag-blue\u0000record:record-2\u0000slot:0',
        recordId: 'record-2',
        groupKey: 'tag-blue'
      },
      {
        id: 'section:(empty)\u0000record:record-3\u0000slot:0',
        recordId: 'record-3',
        groupKey: '(empty)'
      }
    ]
  )

  assert.deepStrictEqual(
    resolveSections(document, 'view-1').map(section => ({
      id: section.key,
      groupKey: section.key,
      title: section.title,
      collapsed: section.collapsed,
      rowIds: section.ids
    })),
    [
      {
        id: 'tag-red',
        groupKey: 'tag-red',
        title: 'Red',
        collapsed: false,
        rowIds: ['section:tag-red\u0000record:record-1\u0000slot:0']
      },
      {
        id: 'tag-blue',
        groupKey: 'tag-blue',
        title: 'Blue',
        collapsed: false,
        rowIds: [
          'section:tag-blue\u0000record:record-1\u0000slot:0',
          'section:tag-blue\u0000record:record-2\u0000slot:0'
        ]
      },
      {
        id: 'tag-green',
        groupKey: 'tag-green',
        title: 'Green',
        collapsed: false,
        rowIds: []
      },
      {
        id: '(empty)',
        groupKey: '(empty)',
        title: 'Empty',
        collapsed: false,
        rowIds: ['section:(empty)\u0000record:record-3\u0000slot:0']
      }
    ]
  )

  assert.deepStrictEqual(
    resolveRowIds(document, 'view-1'),
    [
      'section:tag-red\u0000record:record-1\u0000slot:0',
      'section:tag-blue\u0000record:record-1\u0000slot:0',
      'section:tag-blue\u0000record:record-2\u0000slot:0',
      'section:(empty)\u0000record:record-3\u0000slot:0'
    ]
  )
})

test('table grouped model filters visible rows when sections collapse', () => {
  const document = normalizeGroupDocument(createDocument())
  document.views.byId['view-1'].query.group.buckets = {
    'tag-blue': {
      collapsed: true
    }
  }

  assert.deepStrictEqual(
    currentViewFor(document, 'view-1')?.appearances.ids,
    [
      'section:tag-red\u0000record:record-1\u0000slot:0',
      'section:(empty)\u0000record:record-3\u0000slot:0'
    ]
  )
})

test('table rows apply search directly from the view query', () => {
  const document = normalizeGroupDocument(createDocument())
  document.views.byId['view-1'].query.search = {
    query: 'blue'
  }

  assert.deepStrictEqual(
    resolveRows(document, 'view-1').map(row => ({
      id: row.id,
      recordId: row.recordId,
      groupKey: row.section
    })),
    [
      {
        id: 'section:tag-red\u0000record:record-1\u0000slot:0',
        recordId: 'record-1',
        groupKey: 'tag-red'
      },
      {
        id: 'section:tag-blue\u0000record:record-1\u0000slot:0',
        recordId: 'record-1',
        groupKey: 'tag-blue'
      },
      {
        id: 'section:tag-blue\u0000record:record-2\u0000slot:0',
        recordId: 'record-2',
        groupKey: 'tag-blue'
      }
    ]
  )
})
