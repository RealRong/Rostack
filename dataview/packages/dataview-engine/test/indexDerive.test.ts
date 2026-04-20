import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createFilterOptionSetValue } from '@dataview/core/filter'

import {
  createIndexState,
  deriveIndex
} from '@dataview/engine/active/index/runtime'
import {
  createActiveImpact
} from '@dataview/engine/active/shared/impact'
import {
  buildFieldReducerState,
  createCalculationDemand
} from '@dataview/engine/active/shared/calculation'
import {
  createFieldReducerBuilder
} from '@dataview/engine/active/shared/calculation'
import {
  resolveViewDemand
} from '@dataview/engine/active/demand'
import {
  compileViewQuery
} from '@dataview/engine/active/query'
import {
  buildQueryState
} from '@dataview/engine/active/snapshot/query/derive'
import {
  computeCalculationFromState
} from '@dataview/engine/active/snapshot/summary/compute'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'

const TITLE_FIELD_ID = 'title'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'
const FIELD_PRIORITY = 'priority'
const FIELD_TAGS = 'tags'

const STATUS_OPTIONS = [
  {
    id: 'todo',
    name: 'Todo',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'doing',
    name: 'Doing',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
  }
]

const createFields = (options = STATUS_OPTIONS) => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'status',
    defaultOptionId: 'todo',
    options: options.map(option => ({ ...option }))
  },
  {
    id: FIELD_POINTS,
    name: 'Points',
    kind: 'number',
    format: 'number',
    precision: null,
    currency: null,
    useThousandsSeparator: false
  }
])

const createFieldTable = (fields) => {
  const byId = {}
  fields.forEach(field => {
    byId[field.id] = field
  })

  return {
    byId,
    order: fields.map(field => field.id)
  }
}

const createDocument = (input = {}) => {
  const fields = input.fieldDefs ?? createFields()

  return {
    schemaVersion: 1,
    fields: createFieldTable(fields),
    views: {
      byId: {},
      order: []
    },
    records: {
      byId: {
        rec_1: {
          id: 'rec_1',
          title: 'Task 1',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'todo',
            [FIELD_POINTS]: 1
          }
        },
        rec_2: {
          id: 'rec_2',
          title: 'Task 2',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'doing',
            [FIELD_POINTS]: 2
          }
        },
        rec_3: {
          id: 'rec_3',
          title: 'Task 3',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'done',
            [FIELD_POINTS]: 3
          }
        }
      },
      order: ['rec_1', 'rec_2', 'rec_3']
    },
    meta: {},
    ...input
  }
}

const createImpact = (input = {}) => createActiveImpact(input)

const createTableView = (input = {}) => ({
  id: 'view_table',
  type: 'table',
  name: 'Tasks',
  filter: {
    mode: 'and',
    rules: []
  },
  search: {
    query: ''
  },
  sort: [],
  calc: {},
  display: {
    fields: [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS]
  },
  options: {},
  orders: [],
  ...input
})

const createIndexHarness = (document, demand) => {
  let current = createIndexState(document, demand)

  return {
    state: () => current.state,
    sync: (nextDocument, impact, nextDemand) => {
      current = deriveIndex({
        previous: current.state,
        previousDemand: current.demand,
        document: nextDocument,
        impact,
        ...(nextDemand ? { demand: nextDemand } : {})
      })
      return current
    }
  }
}

test('engine.active.index sync patches search/group/sort/calculation on record value changes', () => {
  const document = createDocument()
  const index = createIndexHarness(document, {
    search: {
      fieldIds: [TITLE_FIELD_ID]
    },
    groups: [{
      fieldId: FIELD_STATUS,
      capability: 'section'
    }],
    sortFields: [FIELD_POINTS],
    calculations: [
      createCalculationDemand(FIELD_STATUS, 'countByOption'),
      createCalculationDemand(FIELD_POINTS, 'sum')
    ]
  })

  const updatedDocument = createDocument()
  updatedDocument.records.byId.rec_2 = {
    ...updatedDocument.records.byId.rec_2,
    title: 'Renamed 2',
    values: {
      ...updatedDocument.records.byId.rec_2.values,
      [FIELD_STATUS]: 'done',
      [FIELD_POINTS]: 5
    }
  }

  const state = index.sync(updatedDocument, createImpact({
    records: {
      touched: new Set(['rec_2']),
      titleChanged: new Set(['rec_2']),
      valueChangedFields: new Set([FIELD_STATUS, FIELD_POINTS])
    }
  })).state

  const titleSearch = state.search.fields.get(TITLE_FIELD_ID)
  assert.equal(titleSearch.texts.get('rec_2'), 'renamed 2')
  assert.equal(titleSearch.texts.get('rec_1'), 'task 1')

  const statusGroup = Array.from(state.group.groups.values())
    .find(group => group.fieldId === FIELD_STATUS && group.capability === 'section')
  assert.equal(statusGroup?.sectionRecords.get('doing'), undefined)
  assert.deepEqual(statusGroup?.sectionRecords.get('done'), ['rec_2', 'rec_3'])

  const pointSort = state.sort.fields.get(FIELD_POINTS)
  assert.deepEqual(pointSort.asc, ['rec_1', 'rec_3', 'rec_2'])

  const pointCalc = state.calculations.fields.get(FIELD_POINTS)
  assert.equal(pointCalc?.global.numeric?.sum, 9)

  const statusCalc = state.calculations.fields.get(FIELD_STATUS)
  assert.equal(statusCalc?.global.option?.counts.get('done'), 2)
})

test('engine.active.resolveViewDemand provisions idle search substrate and shared record values', () => {
  const view = createTableView()
  const document = createDocument({
    activeViewId: view.id,
    views: {
      byId: {
        [view.id]: view
      },
      order: [view.id]
    }
  })

  const demand = resolveViewDemand(createStaticDocumentReadContext(document), view.id)
  const index = createIndexState(document, demand).state

  assert.deepEqual(demand.search, {
    fieldIds: [FIELD_STATUS, TITLE_FIELD_ID]
  })
  assert.equal(demand.sortFields, undefined)
  assert.equal(index.search.fields.size, 2)
  assert.equal(index.search.fields.get(TITLE_FIELD_ID)?.texts.size, 3)
  assert.equal(index.search.fields.get(FIELD_STATUS)?.texts.size, 3)
  assert.equal(index.sort.fields.size, 0)
  assert.deepEqual(Array.from(index.records.values.keys()), [FIELD_POINTS, FIELD_STATUS, TITLE_FIELD_ID])
})

test('engine.active.resolveViewDemand unions search and numeric filter substrates into shared record values', () => {
  const view = createTableView({
    search: {
      query: 'task'
    },
    filter: {
      mode: 'and',
      rules: [{
        fieldId: FIELD_POINTS,
        presetId: 'gt',
        value: 1
      }]
    }
  })
  const document = createDocument({
    activeViewId: view.id,
    views: {
      byId: {
        [view.id]: view
      },
      order: [view.id]
    }
  })

  const demand = resolveViewDemand(createStaticDocumentReadContext(document), view.id)
  const index = createIndexState(document, demand).state

  assert.deepEqual(demand.search, {
    fieldIds: [FIELD_STATUS, TITLE_FIELD_ID]
  })
  assert.deepEqual(demand.sortFields, [FIELD_POINTS])
  assert.equal(index.search.fields.size, 2)
  assert.equal(index.search.fields.get(TITLE_FIELD_ID)?.texts.size, 3)
  assert.equal(index.search.fields.get(FIELD_STATUS)?.texts.size, 3)
  assert.deepEqual(Array.from(index.sort.fields.keys()), [FIELD_POINTS])
  assert.deepEqual(Array.from(index.records.values.keys()), [FIELD_POINTS, FIELD_STATUS, TITLE_FIELD_ID])
})

test('engine.active.resolveViewDemand ignores ineffective persisted filters for group and sort demand', () => {
  const FIELD_DUE = 'due'
  const fields = [
    ...createFields(),
    {
      id: FIELD_PRIORITY,
      name: 'Priority',
      kind: 'select',
      options: [
        { id: 'p1', name: 'P1', color: 'red' }
      ]
    },
    {
      id: FIELD_TAGS,
      name: 'Tags',
      kind: 'multiSelect',
      options: [
        { id: 'tag-a', name: 'Tag A', color: 'blue' }
      ]
    },
    {
      id: FIELD_DUE,
      name: 'Due',
      kind: 'date',
      includeTime: false
    }
  ]
  const view = createTableView({
    sort: [{
      field: FIELD_DUE,
      direction: 'desc'
    }],
    filter: {
      mode: 'and',
      rules: [
        {
          fieldId: FIELD_POINTS,
          presetId: 'gt'
        },
        {
          fieldId: FIELD_DUE,
          presetId: 'eq'
        },
        {
          fieldId: FIELD_STATUS,
          presetId: 'eq',
          value: createFilterOptionSetValue()
        },
        {
          fieldId: FIELD_PRIORITY,
          presetId: 'eq',
          value: createFilterOptionSetValue()
        },
        {
          fieldId: FIELD_TAGS,
          presetId: 'contains',
          value: createFilterOptionSetValue()
        }
      ]
    }
  })
  const document = createDocument({
    fieldDefs: fields,
    activeViewId: view.id,
    views: {
      byId: {
        [view.id]: view
      },
      order: [view.id]
    }
  })

  const demand = resolveViewDemand(createStaticDocumentReadContext(document), view.id)

  assert.deepEqual(demand.sortFields, [FIELD_DUE])
  assert.equal(demand.groups, undefined)
})

test('engine.active.index derive adds demanded sort fields without rebuilding existing field indexes', () => {
  const FIELD_UPDATED_AT = 'updatedAt'
  const fields = [
    ...createFields(),
    {
      id: FIELD_UPDATED_AT,
      name: 'Updated At',
      kind: 'date',
      includeTime: true
    }
  ]
  const document = createDocument({
    fieldDefs: fields,
    records: {
      byId: {
        rec_1: {
          id: 'rec_1',
          title: 'Task 1',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'todo',
            [FIELD_POINTS]: 1,
            [FIELD_UPDATED_AT]: '2024-01-01T00:00:00.000Z'
          }
        },
        rec_2: {
          id: 'rec_2',
          title: 'Task 2',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'doing',
            [FIELD_POINTS]: 2,
            [FIELD_UPDATED_AT]: '2024-01-02T00:00:00.000Z'
          }
        },
        rec_3: {
          id: 'rec_3',
          title: 'Task 3',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'done',
            [FIELD_POINTS]: 3,
            [FIELD_UPDATED_AT]: '2024-01-03T00:00:00.000Z'
          }
        }
      },
      order: ['rec_1', 'rec_2', 'rec_3']
    }
  })
  const previous = createIndexState(document, {
    sortFields: [FIELD_UPDATED_AT]
  })
  const previousUpdatedAt = previous.state.sort.fields.get(FIELD_UPDATED_AT)
  assert.ok(previousUpdatedAt)

  const next = deriveIndex({
    previous: previous.state,
    previousDemand: previous.demand,
    document,
    impact: createImpact({}),
    demand: {
      sortFields: [FIELD_UPDATED_AT, FIELD_POINTS]
    }
  })

  assert.equal(next.state.sort.fields.get(FIELD_UPDATED_AT), previousUpdatedAt)
  assert.deepEqual(new Set(next.state.sort.fields.keys()), new Set([FIELD_POINTS, FIELD_UPDATED_AT]))
})

test('engine.active.index sync rebuilds only touched field semantics on schema changes', () => {
  const document = createDocument()
  const index = createIndexHarness(document, {
    search: {
      fieldIds: [FIELD_STATUS]
    },
    sortFields: [FIELD_STATUS, FIELD_POINTS],
    calculations: [
      createCalculationDemand(FIELD_STATUS, 'countByOption')
    ]
  })
  const before = index.state()

  const renamedFields = createFields([
    STATUS_OPTIONS[0],
    STATUS_OPTIONS[1],
    {
      ...STATUS_OPTIONS[2],
      name: 'Finished'
    }
  ])
  const updatedDocument = createDocument({
    fieldDefs: renamedFields
  })

  const state = index.sync(updatedDocument, createImpact({
    fields: {
      schema: new Map([
        [FIELD_STATUS, new Set(['options'])]
      ])
    }
  })).state

  assert.equal(state.sort.fields.get(FIELD_POINTS), before.sort.fields.get(FIELD_POINTS))

  const statusSearch = state.search.fields.get(FIELD_STATUS)
  assert.equal(statusSearch.texts.get('rec_1'), 'todo')
  assert.ok(statusSearch.texts.get('rec_3')?.includes('done'))
  assert.ok(statusSearch.texts.get('rec_3')?.includes('finished'))

  const statusCalc = state.calculations.fields.get(FIELD_STATUS)
  const statusCalcResult = computeCalculationFromState({
    field: updatedDocument.fields.byId[FIELD_STATUS],
    metric: 'countByOption',
    state: statusCalc!.global
  })
  assert.equal(statusCalc?.global.option?.counts.get('done'), 1)
  assert.equal(statusCalcResult.kind, 'distribution')
  if (statusCalcResult.kind !== 'distribution') {
    throw new Error('Expected distribution result for status option counts.')
  }
  assert.deepEqual(statusCalcResult.items.map(item => item.value), [
    'Todo',
    'Doing',
    'Finished'
  ])
})

test('engine.active calculations support select and multiSelect option distributions', () => {
  const document = createDocument({
    fieldDefs: [
      ...createFields(),
      {
        id: FIELD_PRIORITY,
        name: 'Priority',
        kind: 'select',
        options: [
          {
            id: 'high',
            name: 'High',
            color: 'red'
          },
          {
            id: 'low',
            name: 'Low',
            color: 'gray'
          }
        ]
      },
      {
        id: FIELD_TAGS,
        name: 'Tags',
        kind: 'multiSelect',
        options: [
          {
            id: 'bug',
            name: 'Bug',
            color: 'red'
          },
          {
            id: 'backend',
            name: 'Backend',
            color: 'blue'
          },
          {
            id: 'frontend',
            name: 'Frontend',
            color: 'green'
          }
        ]
      }
    ],
    records: {
      byId: {
        rec_1: {
          id: 'rec_1',
          title: 'Task 1',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'todo',
            [FIELD_POINTS]: 1,
            [FIELD_PRIORITY]: 'high',
            [FIELD_TAGS]: ['bug', 'backend']
          }
        },
        rec_2: {
          id: 'rec_2',
          title: 'Task 2',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'doing',
            [FIELD_POINTS]: 2,
            [FIELD_PRIORITY]: 'high',
            [FIELD_TAGS]: ['backend']
          }
        },
        rec_3: {
          id: 'rec_3',
          title: 'Task 3',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'done',
            [FIELD_POINTS]: 3,
            [FIELD_PRIORITY]: 'low',
            [FIELD_TAGS]: ['bug', 'frontend']
          }
        }
      },
      order: ['rec_1', 'rec_2', 'rec_3']
    }
  })

  const index = createIndexHarness(document, {
    calculations: [
      createCalculationDemand(FIELD_PRIORITY, 'countByOption'),
      createCalculationDemand(FIELD_TAGS, 'countByOption')
    ]
  })
  const state = index.state()
  const priorityField = document.fields.byId[FIELD_PRIORITY]
  const tagField = document.fields.byId[FIELD_TAGS]
  const priorityCalc = state.calculations.fields.get(FIELD_PRIORITY)
  const tagCalc = state.calculations.fields.get(FIELD_TAGS)

  assert.equal(priorityCalc?.global.option?.counts.get('high'), 2)
  assert.equal(priorityCalc?.global.option?.counts.get('low'), 1)
  assert.equal(tagCalc?.global.option?.counts.get('bug'), 2)
  assert.equal(tagCalc?.global.option?.counts.get('backend'), 2)
  assert.equal(tagCalc?.global.option?.counts.get('frontend'), 1)

  const priorityResult = computeCalculationFromState({
    field: priorityField,
    metric: 'percentByOption',
    state: priorityCalc!.global
  })
  const tagResult = computeCalculationFromState({
    field: tagField,
    metric: 'countByOption',
    state: tagCalc!.global
  })

  assert.equal(priorityResult.kind, 'distribution')
  if (priorityResult.kind !== 'distribution') {
    throw new Error('Expected priority option summary to be a distribution result.')
  }
  assert.equal(priorityResult.denominator, 3)
  assert.deepEqual(priorityResult.items.map(item => item.key), ['high', 'low'])
  assert.deepEqual(priorityResult.items.map(item => item.value), [
    'High',
    'Low'
  ])
  assert.deepEqual(priorityResult.items.map(item => item.percent), [2 / 3, 1 / 3])

  assert.equal(tagResult.kind, 'distribution')
  if (tagResult.kind !== 'distribution') {
    throw new Error('Expected tag option summary to be a distribution result.')
  }
  assert.equal(tagResult.denominator, 5)
  assert.deepEqual(tagResult.items.map(item => item.key), ['bug', 'backend', 'frontend'])
  assert.deepEqual(tagResult.items.map(item => item.value), [
    'Bug',
    'Backend',
    'Frontend'
  ])
  assert.deepEqual(tagResult.items.map(item => item.count), [2, 2, 1])
})

test('engine.active field reducer builder reuses previous state when net deltas cancel out', () => {
  const entry = {
    empty: false,
    uniqueKey: 'text:todo',
    number: 3,
    optionIds: ['todo']
  } as const
  const capabilities = {
    count: true,
    unique: true,
    numeric: true,
    option: true
  } as const
  const previous = buildFieldReducerState({
    entries: new Map([
      ['rec_1', entry]
    ]),
    capabilities
  })
  const reducer = createFieldReducerBuilder({
    previous,
    capabilities
  })

  assert.equal(reducer.apply(entry, undefined), true)
  assert.equal(reducer.apply(undefined, entry), true)
  assert.equal(reducer.finish(), previous)
})

test('engine.active.query derives descending order from single asc sort index', () => {
  const document = createDocument()
  const index = createIndexState(document, {
    sortFields: [FIELD_POINTS]
  })

  const query = buildQueryState({
    reader: createStaticDocumentReadContext(document).reader,
    index: index.state,
    view: {
      id: 'view_points_desc',
      name: 'Points Desc',
      type: 'table',
      search: {
        query: ''
      },
      filter: {
        mode: 'and',
        rules: []
      },
      sort: [{
        field: FIELD_POINTS,
        direction: 'desc'
      }],
      calc: {},
      display: {},
      options: {
        table: {},
        gallery: {},
        kanban: {}
      },
      orders: []
    },
    plan: compileViewQuery(createStaticDocumentReadContext(document).reader, {
      id: 'view_points_desc',
      name: 'Points Desc',
      type: 'table',
      search: {
        query: ''
      },
      filter: {
        mode: 'and',
        rules: []
      },
      sort: [{
        field: FIELD_POINTS,
        direction: 'desc'
      }],
      calc: {},
      display: {},
      options: {
        table: {},
        gallery: {},
        kanban: {}
      },
      orders: []
    })
  })

  assert.deepEqual(query.records.matched, ['rec_3', 'rec_2', 'rec_1'])
  assert.deepEqual(query.records.ordered, ['rec_3', 'rec_2', 'rec_1'])
  assert.deepEqual(query.records.visible, ['rec_3', 'rec_2', 'rec_1'])
})

test('engine.active.query keeps empty values at the end for title, status, and number sorts', () => {
  const document = createDocument()
  document.records.byId.rec_1 = {
    ...document.records.byId.rec_1,
    title: '',
    values: {
      [FIELD_STATUS]: undefined,
      [FIELD_POINTS]: undefined
    }
  }
  document.records.byId.rec_2 = {
    ...document.records.byId.rec_2,
    title: 'Alpha',
    values: {
      ...document.records.byId.rec_2.values,
      [FIELD_STATUS]: 'todo',
      [FIELD_POINTS]: 2
    }
  }
  document.records.byId.rec_3 = {
    ...document.records.byId.rec_3,
    title: 'Beta',
    values: {
      ...document.records.byId.rec_3.values,
      [FIELD_STATUS]: 'doing',
      [FIELD_POINTS]: 1
    }
  }

  const index = createIndexState(document, {
    sortFields: [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS]
  })
  const reader = createStaticDocumentReadContext(document).reader
  const titleAscView = createTableView({
    sort: [{
      field: TITLE_FIELD_ID,
      direction: 'asc'
    }]
  })
  const titleDescView = createTableView({
    sort: [{
      field: TITLE_FIELD_ID,
      direction: 'desc'
    }]
  })
  const statusDescView = createTableView({
    sort: [{
      field: FIELD_STATUS,
      direction: 'desc'
    }]
  })
  const pointsDescView = createTableView({
    sort: [{
      field: FIELD_POINTS,
      direction: 'desc'
    }]
  })

  const titleAsc = buildQueryState({
    reader,
    index: index.state,
    view: titleAscView,
    plan: compileViewQuery(reader, titleAscView)
  })
  const titleDesc = buildQueryState({
    reader,
    index: index.state,
    view: titleDescView,
    plan: compileViewQuery(reader, titleDescView)
  })
  const statusDesc = buildQueryState({
    reader,
    index: index.state,
    view: statusDescView,
    plan: compileViewQuery(reader, statusDescView)
  })
  const pointsDesc = buildQueryState({
    reader,
    index: index.state,
    view: pointsDescView,
    plan: compileViewQuery(reader, pointsDescView)
  })

  assert.deepEqual(titleAsc.records.visible, ['rec_2', 'rec_3', 'rec_1'])
  assert.deepEqual(titleDesc.records.visible, ['rec_3', 'rec_2', 'rec_1'])
  assert.deepEqual(statusDesc.records.visible, ['rec_3', 'rec_2', 'rec_1'])
  assert.deepEqual(pointsDesc.records.visible, ['rec_2', 'rec_3', 'rec_1'])
})
