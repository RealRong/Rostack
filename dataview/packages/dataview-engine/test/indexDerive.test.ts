import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  createIndexState,
  deriveIndex
} from '@dataview/engine/active/index/runtime'
import {
  computeCalculationFromState
} from '@dataview/engine/active/snapshot/summary/compute'

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

const createDelta = (input = {}) => ({
  summary: {
    records: false,
    fields: false,
    views: false,
    values: false,
    activeView: false,
    indexes: true,
    ...input.summary
  },
  entities: input.entities ?? {},
  semantics: input.semantics ?? []
})

const createIndexHarness = (document, demand) => {
  let current = createIndexState(document, demand)

  return {
    state: () => current.state,
    sync: (nextDocument, delta, nextDemand) => {
      current = deriveIndex({
        previous: current.state,
        previousDemand: current.demand,
        document: nextDocument,
        delta,
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
      fields: [TITLE_FIELD_ID]
    },
    groups: [{
      fieldId: FIELD_STATUS
    }],
    sortFields: [FIELD_POINTS],
    calculationFields: [FIELD_STATUS, FIELD_POINTS]
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

  const state = index.sync(updatedDocument, createDelta({
    summary: {
      records: true,
      values: true
    },
    entities: {
      values: {
        records: ['rec_2'],
        fields: [FIELD_STATUS, FIELD_POINTS]
      }
    },
    semantics: [
      {
        kind: 'record.patch',
        ids: ['rec_2'],
        aspects: ['title']
      },
      {
        kind: 'record.values',
        records: ['rec_2'],
        fields: [FIELD_STATUS, FIELD_POINTS]
      }
    ]
  })).state

  const titleSearch = state.search.fields.get(TITLE_FIELD_ID)
  assert.equal(titleSearch.texts.get('rec_2'), 'renamed 2')
  assert.equal(titleSearch.texts.get('rec_1'), 'task 1')

  const statusGroup = Array.from(state.group.groups.values())
    .find(group => group.fieldId === FIELD_STATUS)
  assert.equal(statusGroup.bucketRecords.get('doing'), undefined)
  assert.deepEqual(statusGroup.bucketRecords.get('done'), ['rec_2', 'rec_3'])

  const pointSort = state.sort.fields.get(FIELD_POINTS)
  assert.deepEqual(pointSort.asc, ['rec_1', 'rec_3', 'rec_2'])
  assert.deepEqual(pointSort.desc, ['rec_2', 'rec_3', 'rec_1'])

  const pointCalc = state.calculations.fields.get(FIELD_POINTS)
  assert.equal(pointCalc.global.sum, 9)

  const statusCalc = state.calculations.fields.get(FIELD_STATUS)
  assert.deepEqual(statusCalc.global.distribution.get('Done'), 2)
})

test('engine.active.index sync rebuilds only touched field semantics on schema changes', () => {
  const document = createDocument()
  const index = createIndexHarness(document, {
    search: {
      fields: [FIELD_STATUS]
    },
    sortFields: [FIELD_STATUS, FIELD_POINTS],
    calculationFields: [FIELD_STATUS]
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

  const state = index.sync(updatedDocument, createDelta({
    summary: {
      fields: true
    },
    entities: {
      fields: {
        update: [FIELD_STATUS]
      }
    },
    semantics: [
      {
        kind: 'field.schema',
        fieldId: FIELD_STATUS,
        aspects: ['options']
      }
    ]
  })).state

  assert.equal(state.sort.fields.get(FIELD_POINTS), before.sort.fields.get(FIELD_POINTS))

  const statusSearch = state.search.fields.get(FIELD_STATUS)
  assert.equal(statusSearch.texts.get('rec_1'), 'todo')
  assert.ok(statusSearch.texts.get('rec_3')?.includes('done'))
  assert.ok(statusSearch.texts.get('rec_3')?.includes('finished'))

  const statusCalc = state.calculations.fields.get(FIELD_STATUS)
  assert.equal(statusCalc.global.distribution.get('Done'), undefined)
  assert.equal(statusCalc.global.distribution.get('Finished'), 1)
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
    calculationFields: [FIELD_PRIORITY, FIELD_TAGS]
  })
  const state = index.state()
  const priorityField = document.fields.byId[FIELD_PRIORITY]
  const tagField = document.fields.byId[FIELD_TAGS]
  const priorityCalc = state.calculations.fields.get(FIELD_PRIORITY)
  const tagCalc = state.calculations.fields.get(FIELD_TAGS)

  assert.equal(priorityCalc.global.optionCounts.get('high'), 2)
  assert.equal(priorityCalc.global.optionCounts.get('low'), 1)
  assert.equal(tagCalc.global.optionCounts.get('bug'), 2)
  assert.equal(tagCalc.global.optionCounts.get('backend'), 2)
  assert.equal(tagCalc.global.optionCounts.get('frontend'), 1)

  const priorityResult = computeCalculationFromState({
    field: priorityField,
    metric: 'percentByOption',
    state: priorityCalc.global
  })
  const tagResult = computeCalculationFromState({
    field: tagField,
    metric: 'countByOption',
    state: tagCalc.global
  })

  assert.equal(priorityResult.kind, 'distribution')
  assert.equal(priorityResult.denominator, 3)
  assert.deepEqual(priorityResult.items.map(item => item.key), ['high', 'low'])
  assert.deepEqual(priorityResult.items.map(item => item.label), ['High', 'Low'])
  assert.deepEqual(priorityResult.items.map(item => item.percent), [2 / 3, 1 / 3])

  assert.equal(tagResult.kind, 'distribution')
  assert.equal(tagResult.denominator, 5)
  assert.deepEqual(tagResult.items.map(item => item.key), ['bug', 'backend', 'frontend'])
  assert.deepEqual(tagResult.items.map(item => item.label), ['Bug', 'Backend', 'Frontend'])
  assert.deepEqual(tagResult.items.map(item => item.count), [2, 2, 1])
})
