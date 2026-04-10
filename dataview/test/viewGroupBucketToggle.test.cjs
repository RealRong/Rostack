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

const projectSectionRecordIds = (engine, sectionKey) => {
  const sections = engine.project.sections.get() ?? []
  const appearances = engine.project.appearances.get()

  return (
    sections.find(section => section.key === sectionKey)?.ids
      .map(id => appearances?.get(id)?.recordId)
      .filter(Boolean)
    ?? []
  )
}

const projectSnapshot = engine => {
  const calculations = engine.project.calculations.get()

  return {
    records: {
      derivedIds: [...(engine.project.records.get()?.derivedIds ?? [])],
      orderedIds: [...(engine.project.records.get()?.orderedIds ?? [])],
      visibleIds: [...(engine.project.records.get()?.visibleIds ?? [])]
    },
    sections: (engine.project.sections.get() ?? []).map(section => ({
      key: section.key,
      collapsed: section.collapsed,
      recordIds: projectSectionRecordIds(engine, section.key)
    })),
    calculations: Object.fromEntries(
      Array.from(calculations?.entries() ?? []).map(([sectionKey, collection]) => [
        sectionKey,
        Object.fromEntries(Array.from(collection.byField.entries()))
      ])
    )
  }
}

test('view group bucket toggle clears the final collapsed bucket state', () => {
  const engine = createEngine({
    document: createDocument()
  })

  engine.view.open(VIEW_TABLE)
  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)
  engine.view(VIEW_TABLE).group.toggleCollapse('todo')

  let view = engine.read.view.get(VIEW_TABLE)
  let sections = engine.project.sections.get()

  assert.deepEqual(view.group.buckets, {
    todo: {
      collapsed: true
    }
  })
  assert.equal(
    sections.find(section => section.key === 'todo')?.collapsed,
    true
  )

  engine.view(VIEW_TABLE).group.toggleCollapse('todo')

  view = engine.read.view.get(VIEW_TABLE)
  sections = engine.project.sections.get()

  assert.equal(view.group?.buckets, undefined)
  assert.equal(
    sections.find(section => section.key === 'todo')?.collapsed,
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

test('engine.project records honor search filter sort and manual order', () => {
  const engine = createEngine({
    document: createDocument()
  })

  assert.deepEqual(
    engine.project.records.get()?.visibleIds,
    ['rec_1', 'rec_2', 'rec_3']
  )

  engine.view(VIEW_TABLE).search.set('task 2')
  assert.deepEqual(
    engine.project.records.get()?.visibleIds,
    ['rec_2']
  )

  engine.view(VIEW_TABLE).search.set('')
  engine.view(VIEW_TABLE).filter.add(FIELD_STATUS)
  engine.view(VIEW_TABLE).filter.set(0, {
    fieldId: FIELD_STATUS,
    presetId: 'eq',
    value: 'done'
  })
  assert.deepEqual(
    engine.project.records.get()?.visibleIds,
    ['rec_3']
  )

  engine.view(VIEW_TABLE).filter.clear()
  engine.view(VIEW_TABLE).sort.only(FIELD_POINTS, 'desc')
  assert.deepEqual(
    engine.project.records.get()?.derivedIds,
    ['rec_3', 'rec_2', 'rec_1']
  )
  assert.deepEqual(
    engine.project.records.get()?.orderedIds,
    ['rec_3', 'rec_2', 'rec_1']
  )

  engine.view(VIEW_TABLE).sort.clear()
  engine.view(VIEW_TABLE).order.move(['rec_3'], 'rec_1')
  assert.deepEqual(
    engine.project.records.get()?.orderedIds,
    ['rec_3', 'rec_1', 'rec_2']
  )
  assert.deepEqual(
    engine.project.records.get()?.visibleIds,
    ['rec_3', 'rec_1', 'rec_2']
  )
})

test('engine.project grouped sections keep visible record order inside each bucket', () => {
  const document = createDocument()
  document.records.byId.rec_4 = {
    id: 'rec_4',
    title: 'Task 4',
    type: 'task',
    values: {
      [FIELD_STATUS]: 'todo',
      [FIELD_POINTS]: 4
    }
  }
  document.records.order = ['rec_1', 'rec_2', 'rec_3', 'rec_4']

  const engine = createEngine({
    document
  })

  engine.view(VIEW_TABLE).sort.only(FIELD_POINTS, 'desc')
  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)

  const sections = engine.project.sections.get()
  const appearances = engine.project.appearances.get()
  const todoIds = sections
    ?.find(section => section.key === 'todo')
    ?.ids
    .map(id => appearances?.get(id)?.recordId)

  assert.deepEqual(todoIds, ['rec_4', 'rec_1'])
})

test('engine.project calculations are derived from index aggregates', () => {
  const document = createDocument()
  document.records.byId.rec_4 = {
    id: 'rec_4',
    title: 'Task 4',
    type: 'task',
    values: {
      [FIELD_STATUS]: 'todo',
      [FIELD_POINTS]: 4
    }
  }
  document.records.order = ['rec_1', 'rec_2', 'rec_3', 'rec_4']

  const engine = createEngine({
    document
  })

  engine.view(VIEW_TABLE).calc.set(FIELD_POINTS, 'median')
  engine.view(VIEW_TABLE).calc.set(FIELD_STATUS, 'countUniqueValues')

  let calculations = engine.project.calculations.get()
  let root = calculations?.get('root')

  assert.equal(root?.get(FIELD_POINTS)?.kind, 'scalar')
  assert.equal(root?.get(FIELD_POINTS)?.value, 2.5)
  assert.equal(root?.get(FIELD_STATUS)?.kind, 'scalar')
  assert.equal(root?.get(FIELD_STATUS)?.value, 3)

  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)
  engine.view(VIEW_TABLE).calc.set(FIELD_STATUS, 'percentByOption')

  calculations = engine.project.calculations.get()
  const todo = calculations?.get('todo')
  const todoMedian = todo?.get(FIELD_POINTS)
  const todoStatus = todo?.get(FIELD_STATUS)

  assert.equal(todoMedian?.kind, 'scalar')
  assert.equal(todoMedian?.value, 2.5)
  assert.equal(todoStatus?.kind, 'distribution')
  assert.equal(todoStatus?.items[0]?.key, 'todo')
  assert.equal(todoStatus?.items[0]?.percent, 1)
})

test('engine.project sync reuses unaffected grouped sections and calculations on data changes', () => {
  const engine = createEngine({
    document: createDocument()
  })

  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)
  engine.view(VIEW_TABLE).calc.set(FIELD_POINTS, 'sum')

  const recordsBefore = engine.project.records.get()
  const sectionsBefore = engine.project.sections.get()
  const appearancesBefore = engine.project.appearances.get()
  const calculationsBefore = engine.project.calculations.get()
  const doingSectionBefore = sectionsBefore?.find(section => section.key === 'doing')
  const doneSectionBefore = sectionsBefore?.find(section => section.key === 'done')
  const doingCalculationBefore = calculationsBefore?.get('doing')
  const doneCalculationBefore = calculationsBefore?.get('done')
  const doingAppearanceBefore = doingSectionBefore?.ids[0]
    ? appearancesBefore?.get(doingSectionBefore.ids[0])
    : undefined

  engine.records.setValue('rec_1', FIELD_STATUS, 'done')

  const recordsAfter = engine.project.records.get()
  const sectionsAfter = engine.project.sections.get()
  const appearancesAfter = engine.project.appearances.get()
  const calculationsAfter = engine.project.calculations.get()
  const doingSectionAfter = sectionsAfter?.find(section => section.key === 'doing')
  const doneSectionAfter = sectionsAfter?.find(section => section.key === 'done')
  const doingAppearanceAfter = doingSectionAfter?.ids[0]
    ? appearancesAfter?.get(doingSectionAfter.ids[0])
    : undefined

  assert.equal(recordsAfter, recordsBefore)
  assert.equal(doingSectionAfter, doingSectionBefore)
  assert.notEqual(doneSectionAfter, doneSectionBefore)
  assert.equal(doingAppearanceAfter, doingAppearanceBefore)
  assert.equal(calculationsAfter?.get('doing'), doingCalculationBefore)
  assert.notEqual(calculationsAfter?.get('done'), doneCalculationBefore)
  assert.deepEqual(projectSectionRecordIds(engine, 'todo'), [])
  assert.deepEqual(projectSectionRecordIds(engine, 'done'), ['rec_1', 'rec_3'])
})

test('engine.project reconcile keeps undo redo equivalent across sequential deltas', () => {
  const engine = createEngine({
    document: createDocument()
  })

  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)
  engine.view(VIEW_TABLE).calc.set(FIELD_POINTS, 'sum')

  const initial = projectSnapshot(engine)

  engine.records.setValue('rec_1', FIELD_POINTS, 10)
  const afterPoints = projectSnapshot(engine)

  engine.records.setValue('rec_1', FIELD_STATUS, 'doing')
  const afterGroupMove = projectSnapshot(engine)

  assert.equal(engine.history.canUndo(), true)
  assert.equal(engine.history.canRedo(), false)

  engine.history.undo()
  assert.deepEqual(projectSnapshot(engine), afterPoints)

  engine.history.undo()
  assert.deepEqual(projectSnapshot(engine), initial)
  assert.equal(engine.history.canRedo(), true)

  engine.history.redo()
  assert.deepEqual(projectSnapshot(engine), afterPoints)

  engine.history.redo()
  assert.deepEqual(projectSnapshot(engine), afterGroupMove)
})

test('engine.perf traces project and publish behavior for incremental updates', () => {
  const engine = createEngine({
    document: createDocument(),
    perf: {
      trace: true,
      stats: true
    }
  })

  engine.view(VIEW_TABLE).group.set(FIELD_STATUS)
  engine.view(VIEW_TABLE).calc.set(FIELD_POINTS, 'sum')
  engine.perf.trace.clear()
  engine.perf.stats.clear()

  engine.records.setValue('rec_1', FIELD_STATUS, 'done')

  const trace = engine.perf.trace.last()
  const stats = engine.perf.stats.snapshot()
  const sectionsStage = trace?.project.stages.find(stage => stage.stage === 'sections')
  const calculationsStage = trace?.project.stages.find(stage => stage.stage === 'calc')

  assert.ok(trace)
  assert.equal(trace.kind, 'dispatch')
  assert.equal(trace.delta.summary.values, true)
  assert.equal(trace.project.plan.query, 'reuse')
  assert.equal(trace.project.plan.sections, 'sync')
  assert.equal(trace.project.plan.calc, 'sync')
  assert.equal(trace.project.plan.nav, 'sync')
  assert.equal(trace.project.plan.adapters, 'sync')
  assert.equal(trace.index.group.action, 'sync')
  assert.ok(trace.publish.changedStores.includes('sections'))
  assert.ok(trace.publish.changedStores.includes('appearances'))
  assert.ok(trace.publish.changedStores.includes('calculations'))
  assert.equal(sectionsStage?.action, 'sync')
  assert.equal(calculationsStage?.action, 'sync')
  assert.ok((sectionsStage?.metrics?.reusedNodeCount ?? 0) >= 2)
  assert.ok((calculationsStage?.metrics?.reusedNodeCount ?? 0) >= 1)
  assert.equal(stats.commits.total, 1)
  assert.equal(stats.commits.dispatch, 1)
  assert.equal(stats.stages.sections.sync, 1)
  assert.equal(stats.indexes.group.changed, 1)
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
