const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createGroupEngine
} = require('../.tmp/group-test-dist/index.js')
const {
  normalizeGroupDocument
} = require('../.tmp/group-test-dist/core/document/index.js')
const {
  normalizeGroupViewQuery,
  resolveViewGroupState,
  setViewGroup,
  setViewGroupBucketInterval,
  setViewGroupBucketSort,
  toggleViewGroup
} = require('../.tmp/group-test-dist/core/query/index.js')
const {
  resolveGroupedRecords
} = require('../.tmp/group-test-dist/core/query/grouping.js')

const createDocument = viewQuery => normalizeGroupDocument({
  schemaVersion: 1,
  records: {
    byId: {
      'record-1': {
        id: 'record-1',
        values: {
          'field-status': 'todo',
          'field-tags': ['tag-red', 'tag-blue'],
          'field-score': 15
        }
      },
      'record-2': {
        id: 'record-2',
        values: {
          'field-status': 'done',
          'field-tags': ['tag-blue'],
          'field-score': 155
        }
      },
      'record-3': {
        id: 'record-3',
        values: {
          'field-status': 'todo',
          'field-tags': [],
          'field-score': 33
        }
      }
    },
    order: ['record-1', 'record-2', 'record-3']
  },
  properties: {
    byId: {
      'field-status': {
        id: 'field-status',
        key: 'status',
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
      },
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
      },
      'field-score': {
        id: 'field-score',
        key: 'score',
        name: 'Score',
        kind: 'number',
        config: {
          type: 'number',
          format: 'number'
        }
      }
    },
    order: ['field-status', 'field-tags', 'field-score']
  },
  views: {
    byId: {
      'view-1': {
        id: 'view-1',
        type: 'kanban',
        name: 'Board',
        ...(viewQuery
          ? {
              query: viewQuery
            }
          : {})
      }
    },
    order: ['view-1']
  }
})

test('view.query.set replaces query with a canonical payload', () => {
  const engine = createGroupEngine({
    document: createDocument({
      search: {
        query: 'alpha'
      },
      sorters: [{
        property: 'field-status',
        direction: 'asc'
      }],
      group: {
        property: 'field-status',
        mode: 'option',
        bucketSort: 'manual'
      }
    })
  })

  const result = engine.command({
    type: 'view.query.set',
    viewId: 'view-1',
    query: {
      search: {
        query: ''
      },
      filter: {
        mode: 'and',
        rules: []
      },
      sorters: [],
      group: {
        property: 'field-tags',
        mode: 'option',
        bucketSort: 'manual'
      }
    }
  })

  assert.equal(result.applied, true)
  assert.deepStrictEqual(engine.document.export().views.byId['view-1'].query, {
    search: {
      query: '',
      properties: undefined
    },
    filter: {
      mode: 'and',
      rules: []
    },
    sorters: [],
    group: {
      property: 'field-tags',
      mode: 'option',
      bucketSort: 'manual'
    }
  })
})

test('clearing the last query entry leaves an empty canonical query state', () => {
  const engine = createGroupEngine({
    document: createDocument({
      group: {
        property: 'field-status',
        mode: 'option',
        bucketSort: 'manual'
      }
    })
  })

  engine.view('view-1').query.clearGroup()

  assert.deepStrictEqual(engine.document.export().views.byId['view-1'].query, {
    search: {
      query: '',
      properties: undefined
    },
    filter: {
      mode: 'and',
      rules: []
    },
    sorters: [],
    group: undefined
  })
})

test('query.setGroup writes canonical grouping state', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.view('view-1').query.setGroup('field-status')

  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].query,
    {
      search: {
        query: '',
        properties: undefined
      },
      filter: {
        mode: 'and',
        rules: []
      },
      sorters: [],
      group: {
        property: 'field-status',
        mode: 'option',
        bucketSort: 'manual',
        showEmpty: true
      }
    }
  )
})

test('query grouping actions write advanced grouping fields', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.view('view-1').query.setGroup('field-score')
  engine.view('view-1').query.setGroupMode('range')
  engine.view('view-1').query.setGroupBucketSort('valueDesc')
  engine.view('view-1').query.setGroupBucketInterval(100)

  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].query.group,
    {
      property: 'field-score',
      mode: 'range',
      bucketSort: 'valueDesc',
      bucketInterval: 100,
      showEmpty: false
    }
  )
})

test('query actions compose search sorter and group updates', () => {
  const engine = createGroupEngine({
    document: createDocument()
  })

  engine.view('view-1').query.setSearchQuery('alpha')
  engine.view('view-1').query.addSorter('field-status', 'desc')
  engine.view('view-1').query.setGroup('field-score')
  engine.view('view-1').query.setGroupMode('range')
  engine.view('view-1').query.setGroupBucketSort('valueDesc')
  engine.view('view-1').query.setGroupBucketInterval(100)

  assert.deepStrictEqual(
    engine.document.export().views.byId['view-1'].query,
    {
      search: {
        query: 'alpha',
        properties: undefined
      },
      filter: {
        mode: 'and',
        rules: []
      },
      sorters: [{
        property: 'field-status',
        direction: 'desc'
      }],
      group: {
        property: 'field-score',
        mode: 'range',
        bucketSort: 'valueDesc',
        bucketInterval: 100,
        showEmpty: false
      }
    }
  )
})

test('toggleViewGroup applies the default mode and clears when toggled again', () => {
  const initial = normalizeGroupViewQuery()
  const grouped = toggleViewGroup(initial, {
    id: 'field-status',
    kind: 'status'
  })

  assert.deepStrictEqual(grouped.group, {
    property: 'field-status',
    mode: 'option',
    bucketSort: 'manual',
    showEmpty: true
  })

  const cleared = toggleViewGroup(grouped, {
    id: 'field-status',
    kind: 'status'
  })

  assert.equal(cleared.group, undefined)
})

test('resolveGroupedRecords reuses schema order and keeps multi-select records in multiple groups', () => {
  const document = createDocument()
  const records = document.records.order.map(recordId => document.records.byId[recordId])

  const groups = resolveGroupedRecords(document, records, {
    property: 'field-tags'
  })

  assert.deepStrictEqual(
    groups.map(group => ({
      key: group.key,
      title: group.title,
      records: group.records
    })),
    [
      {
        key: 'tag-red',
        title: 'Red',
        records: ['record-1']
      },
      {
        key: 'tag-blue',
        title: 'Blue',
        records: ['record-1', 'record-2']
      },
      {
        key: 'tag-green',
        title: 'Green',
        records: []
      },
      {
        key: '(empty)',
        title: 'Empty',
        records: ['record-3']
      }
    ]
  )
})

test('resolveGroupedRecords supports explicit bucket sorting', () => {
  const document = createDocument()
  const records = document.records.order.map(recordId => document.records.byId[recordId])

  const groups = resolveGroupedRecords(document, records, {
    property: 'field-tags',
    mode: 'option',
    bucketSort: 'labelDesc'
  })

  assert.deepStrictEqual(
    groups.map(group => group.title),
    ['Red', 'Green', 'Blue', 'Empty']
  )
})

test('resolveGroupedRecords supports status category grouping', () => {
  const document = createDocument()
  const records = document.records.order.map(recordId => document.records.byId[recordId])

  const groups = resolveGroupedRecords(document, records, {
    property: 'field-status',
    mode: 'category'
  })

  assert.deepStrictEqual(
    groups.map(group => ({
      key: group.key,
      title: group.title,
      records: group.records
    })),
    [
      {
        key: 'todo',
        title: 'To do',
        records: ['record-1', 'record-3']
      },
      {
        key: 'in_progress',
        title: 'In progress',
        records: []
      },
      {
        key: 'complete',
        title: 'Complete',
        records: ['record-2']
      },
      {
        key: '(empty)',
        title: 'Empty',
        records: []
      }
    ]
  )
})

test('resolveGroupedRecords supports number range grouping with an explicit interval', () => {
  const document = createDocument()
  const records = document.records.order.map(recordId => document.records.byId[recordId])

  const groups = resolveGroupedRecords(document, records, {
    property: 'field-score',
    mode: 'range',
    bucketInterval: 100
  })

  assert.deepStrictEqual(
    groups.map(group => ({
      key: group.key,
      title: group.title,
      records: group.records
    })),
    [
      {
        key: 'range:0:100',
        title: '0-99',
        records: ['record-1', 'record-3']
      },
      {
        key: 'range:100:100',
        title: '100-199',
        records: ['record-2']
      }
    ]
  )
})

test('resolveViewGroupState reads canonical grouping state directly', () => {
  const document = createDocument()
  const fields = document.properties.order.map(propertyId => document.properties.byId[propertyId])
  const derivedGroup = resolveViewGroupState(fields, {
    property: 'field-score',
    mode: 'range',
    bucketSort: 'valueAsc',
    bucketInterval: 10
  })

  assert.deepStrictEqual(
    {
      groupByFieldId: derivedGroup.propertyId,
      groupByMode: derivedGroup.mode,
      groupByBucketSort: derivedGroup.bucketSort,
      groupByBucketInterval: derivedGroup.bucketInterval
    },
    {
      groupByFieldId: 'field-score',
      groupByMode: 'range',
      groupByBucketSort: 'valueAsc',
      groupByBucketInterval: 10
    }
  )
})

test('query group setters persist canonical bucket settings', () => {
  const document = createDocument()
  const scoreField = document.properties.byId['field-score']
  const grouped = setViewGroup(normalizeGroupViewQuery(), scoreField)

  assert.deepStrictEqual(grouped.group, {
    property: 'field-score',
    mode: 'range',
    bucketSort: 'valueAsc',
    bucketInterval: 10,
    showEmpty: false
  })

  const sameDefaultBucketSort = setViewGroupBucketSort(grouped, scoreField, 'valueAsc')
  assert.deepStrictEqual(sameDefaultBucketSort.group, {
    property: 'field-score',
    mode: 'range',
    bucketSort: 'valueAsc',
    bucketInterval: 10,
    showEmpty: false
  })

  const sameDefaultBucketInterval = setViewGroupBucketInterval(grouped, scoreField, 10)
  assert.deepStrictEqual(sameDefaultBucketInterval.group, {
    property: 'field-score',
    mode: 'range',
    bucketSort: 'valueAsc',
    bucketInterval: 10,
    showEmpty: false
  })

  assert.deepStrictEqual(
    setViewGroupBucketSort(grouped, scoreField, 'valueDesc').group,
    {
      property: 'field-score',
      mode: 'range',
      bucketSort: 'valueDesc',
      bucketInterval: 10,
      showEmpty: false
    }
  )

  assert.deepStrictEqual(
    setViewGroupBucketInterval(grouped, scoreField, 100).group,
    {
      property: 'field-score',
      mode: 'range',
      bucketSort: 'valueAsc',
      bucketInterval: 100,
      showEmpty: false
    }
  )
})
