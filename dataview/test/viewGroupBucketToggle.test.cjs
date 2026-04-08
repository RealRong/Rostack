const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createDefaultViewOptions,
  createEngine,
  TITLE_FIELD_ID
} = require('../.tmp/group-test-dist')

const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'
const VIEW_TABLE = 'view_table'

const STATUS_OPTIONS = [
  {
    id: 'todo',
    name: 'Todo',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'doing',
    name: 'In Progress',
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

const createFields = () => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'status',
    defaultOptionId: 'todo',
    options: STATUS_OPTIONS.map(option => ({ ...option }))
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

const createDocument = () => {
  const fields = createFields()

  return {
    schemaVersion: 1,
    fields: createFieldTable(fields),
    views: {
      byId: {
        [VIEW_TABLE]: {
          id: VIEW_TABLE,
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
          options: {
            ...createDefaultViewOptions('table', fields)
          },
          orders: []
        }
      },
      order: [VIEW_TABLE]
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
    meta: {}
  }
}

const createEmptyDocument = () => {
  const fields = createFields()

  return {
    schemaVersion: 1,
    fields: createFieldTable(fields),
    views: {
      byId: {},
      order: []
    },
    records: {
      byId: {},
      order: []
    },
    meta: {}
  }
}

test('view group bucket toggle clears the final collapsed bucket state', () => {
  const engine = createEngine({
    document: createDocument()
  })

  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)
  engine.view(VIEW_TABLE).group.toggleCollapse('todo')

  let view = engine.read.view.get(VIEW_TABLE)
  let projection = engine.read.viewProjection.get(VIEW_TABLE)

  assert.deepEqual(view.group.buckets, {
    todo: {
      collapsed: true
    }
  })
  assert.equal(
    projection.sections.find(section => section.key === 'todo')?.collapsed,
    true
  )

  engine.view(VIEW_TABLE).group.toggleCollapse('todo')

  view = engine.read.view.get(VIEW_TABLE)
  projection = engine.read.viewProjection.get(VIEW_TABLE)

  assert.equal(view.group?.buckets, undefined)
  assert.equal(
    projection.sections.find(section => section.key === 'todo')?.collapsed,
    false
  )
})

test('view group interval set clears back to the field default when value is undefined', () => {
  const engine = createEngine({
    document: createDocument()
  })

  engine.view(VIEW_TABLE).group.set(FIELD_POINTS)

  let view = engine.read.view.get(VIEW_TABLE)
  assert.equal(view.group?.bucketInterval, 10)

  engine.view(VIEW_TABLE).group.setInterval(5)
  view = engine.read.view.get(VIEW_TABLE)
  assert.equal(view.group?.bucketInterval, 5)

  engine.view(VIEW_TABLE).group.setInterval(undefined)
  view = engine.read.view.get(VIEW_TABLE)
  assert.equal(view.group?.bucketInterval, 10)
})

test('view.create resolves duplicate names in the command layer', () => {
  const engine = createEngine({
    document: createDocument()
  })

  const result = engine.command({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  })

  const createdViewId = result.created?.views?.[0]
  assert.ok(createdViewId)
  assert.equal(engine.read.view.get(createdViewId)?.name, 'Tasks 2')
})

test('view.duplicate reuses the shared unique naming rule', () => {
  const engine = createEngine({
    document: createEmptyDocument()
  })

  const sourceViewId = engine.command({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  }).created?.views?.[0]

  assert.ok(sourceViewId)

  engine.command({
    type: 'view.create',
    input: {
      name: 'Tasks Copy',
      type: 'table'
    }
  })

  const result = engine.command({
    type: 'view.duplicate',
    viewId: sourceViewId
  })

  const createdViewId = result.created?.views?.[0]
  assert.ok(createdViewId)
  assert.equal(engine.read.view.get(createdViewId)?.name, 'Tasks Copy 2')
})
