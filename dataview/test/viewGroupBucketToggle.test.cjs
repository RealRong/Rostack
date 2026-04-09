const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createDefaultViewOptions,
  createEngine,
  TITLE_FIELD_ID
} = require('../.tmp/group-test-dist')
const {
  resolveViewProjection
} = require('../.tmp/group-test-dist/engine/projection/view')

const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'
const VIEW_TABLE = 'view_table'
const VIEW_BOARD = 'view_board'

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

const createView = (input = {}) => {
  const fields = createFields()

  return {
    id: input.id ?? VIEW_TABLE,
    type: input.type ?? 'table',
    name: input.name ?? 'Tasks',
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
      ...createDefaultViewOptions(input.type ?? 'table', fields)
    },
    orders: [],
    ...(input.group ? { group: input.group } : {})
  }
}

const createMultiViewDocument = () => {
  const fields = createFields()

  return {
    schemaVersion: 1,
    fields: createFieldTable(fields),
    views: {
      byId: {
        [VIEW_TABLE]: createView({
          id: VIEW_TABLE,
          name: 'Table'
        }),
        [VIEW_BOARD]: createView({
          id: VIEW_BOARD,
          name: 'Board',
          group: {
            field: FIELD_STATUS,
            mode: 'option',
            bucketSort: 'manual',
            showEmpty: true
          }
        })
      },
      order: [VIEW_TABLE, VIEW_BOARD]
    },
    activeViewId: VIEW_TABLE,
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
        }
      },
      order: ['rec_1']
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
  let projection = resolveViewProjection(
    engine.document.export(),
    VIEW_TABLE
  )

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
  projection = resolveViewProjection(
    engine.document.export(),
    VIEW_TABLE
  )

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

test('engine.project rebuilds from one active pipeline while keeping projection boundaries', () => {
  const engine = createEngine({
    document: createMultiViewDocument()
  })

  let viewEvents = 0
  let sortEvents = 0
  const unsubscribeView = engine.project.view.subscribe(() => {
    viewEvents += 1
  })
  const unsubscribeSort = engine.project.sort.subscribe(() => {
    sortEvents += 1
  })

  assert.equal(engine.project.view.get()?.id, VIEW_TABLE)
  assert.equal(engine.project.group.get()?.active, false)
  assert.equal(engine.project.sort.get()?.active, false)

  engine.view(VIEW_TABLE).sort.add(FIELD_POINTS)

  assert.equal(engine.project.view.get()?.id, VIEW_TABLE)
  assert.equal(engine.project.sort.get()?.active, true)
  assert.equal(engine.project.sort.get()?.rules[0]?.sorter.field, FIELD_POINTS)
  assert.equal(viewEvents, 0)
  assert.equal(sortEvents, 1)

  engine.view.open(VIEW_BOARD)

  assert.equal(engine.project.view.get()?.id, VIEW_BOARD)
  assert.equal(engine.project.group.get()?.active, true)
  assert.equal(engine.project.group.get()?.fieldId, FIELD_STATUS)
  assert.equal(viewEvents, 1)

  unsubscribeView()
  unsubscribeSort()
})

test('engine.project exposes body projections for the active view', () => {
  const engine = createEngine({
    document: createDocument()
  })

  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)

  const records = engine.project.records.get()
  const sections = engine.project.sections.get()
  const appearances = engine.project.appearances.get()
  const fields = engine.project.fields.get()
  const calculations = engine.project.calculations.get()

  assert.deepEqual(records?.visibleIds, ['rec_1', 'rec_2', 'rec_3'])
  assert.deepEqual(sections?.map(section => section.key), ['todo', 'doing', 'done', '(empty)'])
  assert.equal(appearances?.ids.length, 3)
  assert.deepEqual(fields?.ids, [FIELD_STATUS, FIELD_POINTS])
  assert.ok(calculations?.get('todo'))
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
