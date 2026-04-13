const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createIndexState,
  deriveIndex
} = require('../.tmp/group-test-dist/engine/index/runtime.js')

const TITLE_FIELD_ID = 'title'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

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

const createFieldTable = fields => {
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

test('engine.index sync patches search/group/sort/calculation on record value changes', () => {
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
  assert.equal(titleSearch.get('rec_2'), 'renamed 2')
  assert.equal(titleSearch.get('rec_1'), 'task 1')

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

test('engine.index sync rebuilds only touched field semantics on schema changes', () => {
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
  assert.equal(statusSearch.get('rec_1'), 'todo')
  assert.ok(statusSearch.get('rec_3')?.includes('done'))
  assert.ok(statusSearch.get('rec_3')?.includes('finished'))

  const statusCalc = state.calculations.fields.get(FIELD_STATUS)
  assert.equal(statusCalc.global.distribution.get('Done'), undefined)
  assert.equal(statusCalc.global.distribution.get('Finished'), 1)
})
