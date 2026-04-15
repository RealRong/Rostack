import assert from 'node:assert/strict'
import { test } from 'vitest'

import { TITLE_FIELD_ID } from '@dataview/core/contracts'
import { createDefaultViewOptions } from '@dataview/core/view'
import { createEngine } from '@dataview/engine'

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

const createEngineForTest = options => createEngine({
  document: options.document,
  ...(options.perf
    ? {
        performance: {
          traces: options.perf.trace,
          stats: options.perf.stats
        }
      }
    : {})
})

const readViewState = engine => engine.active.state.get()

const itemIdByRecordId = (engine, recordId) => {
  const items = readViewState(engine)?.items
  if (!items) {
    return undefined
  }

  return items.ids.find(itemId => items.get(itemId)?.recordId === recordId)
}

const moveRecordOrder = (engine, recordIds, beforeRecordId) => {
  const state = readViewState(engine)
  if (!state) {
    return
  }

  const itemIds = recordIds.flatMap(recordId => {
    const itemId = itemIdByRecordId(engine, recordId)
    return itemId ? [itemId] : []
  })
  if (!itemIds.length) {
    return
  }

  const beforeItemId = beforeRecordId
    ? itemIdByRecordId(engine, beforeRecordId)
    : undefined
  const section = beforeItemId
    ? state.items.get(beforeItemId)?.sectionKey
    : state.items.get(itemIds[0])?.sectionKey ?? state.sections.ids[0]
  if (!section) {
    return
  }

  engine.active.items.move(itemIds, {
    section,
    ...(beforeItemId ? { before: beforeItemId } : {})
  })
}

const openView = (engine, viewId) => {
  engine.views.open(viewId)
  return engine.active
}

const viewSectionRecordIds = (engine, sectionKey) => {
  const state = readViewState(engine)
  return (
    state?.sections.get(sectionKey)?.itemIds
      .map(itemId => state.items.get(itemId)?.recordId)
      .filter(Boolean)
    ?? []
  )
}

const viewSnapshot = engine => {
  const state = readViewState(engine)

  return {
    records: {
      matched: [...(state?.records.matched ?? [])],
      ordered: [...(state?.records.ordered ?? [])],
      visible: [...(state?.records.visible ?? [])]
    },
    sections: (state?.sections.all ?? []).map(section => ({
      key: section.key,
      collapsed: section.collapsed,
      recordIds: viewSectionRecordIds(engine, section.key)
    })),
    summaries: Object.fromEntries(
      Array.from(state?.summaries.entries() ?? []).map(([sectionKey, collection]) => [
        sectionKey,
        Object.fromEntries(Array.from(collection.byField.entries()))
      ])
    )
  }
}

test('view group bucket toggle clears the final collapsed bucket state', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  engine.views.open(VIEW_TABLE)
  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).sections.toggleCollapse('todo')

  let view = engine.select.views.byId.get(VIEW_TABLE)
  let sections = readViewState(engine)?.sections.all ?? []

  assert.deepEqual(view.group.buckets, {
    todo: {
      collapsed: true
    }
  })
  assert.equal(
    sections.find(section => section.key === 'todo')?.collapsed,
    true
  )

  openView(engine, VIEW_TABLE).sections.toggleCollapse('todo')

  view = engine.select.views.byId.get(VIEW_TABLE)
  sections = readViewState(engine)?.sections.all ?? []

  assert.equal(view.group?.buckets, undefined)
  assert.equal(
    sections.find(section => section.key === 'todo')?.collapsed,
    false
  )
})

test('view group interval set clears back to the field default when value is undefined', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_POINTS)

  let view = engine.select.views.byId.get(VIEW_TABLE)
  assert.equal(view.group?.bucketInterval, 10)

  openView(engine, VIEW_TABLE).group.setInterval(5)
  view = engine.select.views.byId.get(VIEW_TABLE)
  assert.equal(view.group?.bucketInterval, 5)

  openView(engine, VIEW_TABLE).group.setInterval(undefined)
  view = engine.select.views.byId.get(VIEW_TABLE)
  assert.equal(view.group?.bucketInterval, 10)
})

test('kanban cards per column defaults to all and persists through the view api', () => {
  const fields = createFields()

  assert.equal(
    createDefaultViewOptions('kanban', fields).kanban.cardsPerColumn,
    25
  )

  const document = createDocument()
  document.views.byId[VIEW_BOARD] = createView({
    id: VIEW_BOARD,
    type: 'kanban',
    name: 'Board',
    group: {
      field: FIELD_STATUS,
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })
  document.views.order.push(VIEW_BOARD)

  const engine = createEngineForTest({
    document
  })

  let board = engine.select.views.byId.get(VIEW_BOARD)
  assert.equal(board.options.kanban.cardsPerColumn, 25)

  openView(engine, VIEW_BOARD).kanban.setCardsPerColumn(25)
  board = engine.select.views.byId.get(VIEW_BOARD)
  assert.equal(board.options.kanban.cardsPerColumn, 25)

  openView(engine, VIEW_BOARD).kanban.setCardsPerColumn(100)
  board = engine.select.views.byId.get(VIEW_BOARD)
  assert.equal(board.options.kanban.cardsPerColumn, 100)

  openView(engine, VIEW_BOARD).kanban.setCardsPerColumn('all')
  board = engine.select.views.byId.get(VIEW_BOARD)
  assert.equal(board.options.kanban.cardsPerColumn, 'all')
})

test('view.create and changeType to kanban resolve a default group field', () => {
  const engine = createEngineForTest({
    document: createMultiViewDocument()
  })

  const createdId = engine.views.create({
    name: 'Auto Board',
    type: 'kanban'
  })
  assert.ok(createdId)
  assert.equal(
    engine.views.get(createdId!)?.group?.field,
    FIELD_STATUS
  )

  openView(engine, VIEW_TABLE).changeType('kanban')
  assert.equal(engine.active.config.get()?.type, 'kanban')
  assert.equal(engine.active.config.get()?.group?.field, FIELD_STATUS)
})

test('kanban default group prefers option-like fields over earlier scalar fields', () => {
  const fields = [
    {
      id: FIELD_POINTS,
      name: 'Points',
      kind: 'number',
      format: 'number',
      precision: null,
      currency: null,
      useThousandsSeparator: false
    },
    {
      id: FIELD_STATUS,
      name: 'Status',
      kind: 'status',
      defaultOptionId: 'todo',
      options: STATUS_OPTIONS.map(option => ({ ...option }))
    }
  ]
  const engine = createEngineForTest({
    document: {
      ...createEmptyDocument(),
      fields: createFieldTable(fields)
    }
  })

  const createdId = engine.views.create({
    name: 'Preferred Board',
    type: 'kanban'
  })

  assert.ok(createdId)
  assert.equal(engine.views.get(createdId!)?.group?.field, FIELD_STATUS)
})

test('engine.active keeps selector boundaries inside one active pipeline', () => {
  const engine = createEngineForTest({
    document: createMultiViewDocument()
  })

  const groupStore = engine.active.select(current => current?.query.group)
  const sortStore = engine.active.select(current => current?.query.sort)
  let idEvents = 0
  let sortEvents = 0
  const unsubscribeId = engine.active.id.subscribe(() => {
    idEvents += 1
  })
  const unsubscribeSort = sortStore.subscribe(() => {
    sortEvents += 1
  })

  assert.equal(engine.active.id.get(), VIEW_TABLE)
  assert.equal(groupStore.get()?.active, false)
  assert.equal(sortStore.get()?.rules.length ?? 0, 0)

  openView(engine, VIEW_TABLE).sort.add(FIELD_POINTS)

  assert.equal(engine.active.id.get(), VIEW_TABLE)
  assert.equal(sortStore.get()?.rules.length, 1)
  assert.equal(sortStore.get()?.rules[0]?.sorter.field, FIELD_POINTS)
  assert.equal(idEvents, 0)
  assert.equal(sortEvents, 1)

  engine.views.open(VIEW_BOARD)

  assert.equal(engine.active.id.get(), VIEW_BOARD)
  assert.equal(groupStore.get()?.active, true)
  assert.equal(groupStore.get()?.fieldId, FIELD_STATUS)
  assert.equal(idEvents, 1)

  unsubscribeId()
  unsubscribeSort()
})

test('engine.document.replace publishes coherent select and active view state in one step', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })
  const nextDocument = createMultiViewDocument()
  let documentEvents = 0

  const unsubscribe = engine.select.document.subscribe(() => {
    documentEvents += 1
    assert.equal(engine.select.document.get().activeViewId, VIEW_TABLE)
    assert.equal(engine.active.id.get(), VIEW_TABLE)
    assert.deepEqual(readViewState(engine)?.records.visible, ['rec_1'])
  })

  engine.document.replace(nextDocument)

  assert.equal(documentEvents, 1)
  assert.equal(engine.active.id.get(), VIEW_TABLE)
  assert.deepEqual(readViewState(engine)?.records.visible, ['rec_1'])

  unsubscribe()
})

test('engine.active.state exposes body projections for the active view', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)

  const state = readViewState(engine)
  const records = state?.records
  const sections = state?.sections.all
  const items = state?.items
  const fields = state?.fields
  const summaries = state?.summaries

  assert.deepEqual(records?.visible, ['rec_1', 'rec_2', 'rec_3'])
  assert.deepEqual(sections?.map(section => section.key), ['todo', 'doing', 'done', '(empty)'])
  assert.equal(items?.ids.length, 3)
  assert.deepEqual(fields?.ids, [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS])
  assert.deepEqual(fields?.custom.map(field => field.id), [FIELD_STATUS, FIELD_POINTS])
  assert.ok(summaries?.get('todo'))
})

test('engine.active.state records honor search filter sort and manual order', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_1', 'rec_2', 'rec_3']
  )

  openView(engine, VIEW_TABLE).search.set('task 2')
  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_2']
  )

  openView(engine, VIEW_TABLE).search.set('')
  openView(engine, VIEW_TABLE).filters.add(FIELD_STATUS)
  openView(engine, VIEW_TABLE).filters.update(0, {
    fieldId: FIELD_STATUS,
    presetId: 'eq',
    value: 'done'
  })
  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_3']
  )

  openView(engine, VIEW_TABLE).filters.clear()
  openView(engine, VIEW_TABLE).sort.keepOnly(FIELD_POINTS, 'desc')
  assert.deepEqual(
    readViewState(engine)?.records.matched,
    ['rec_3', 'rec_2', 'rec_1']
  )
  assert.deepEqual(
    readViewState(engine)?.records.ordered,
    ['rec_3', 'rec_2', 'rec_1']
  )

  openView(engine, VIEW_TABLE).sort.clear()
  moveRecordOrder(engine, ['rec_3'], 'rec_1')
  assert.deepEqual(
    readViewState(engine)?.records.ordered,
    ['rec_3', 'rec_1', 'rec_2']
  )
  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_3', 'rec_1', 'rec_2']
  )
})

test('engine.active.state removes deleted records from sorted query results and item lists', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).sort.keepOnly(FIELD_POINTS, 'desc')
  engine.records.remove('rec_2')

  const state = readViewState(engine)

  assert.deepEqual(state?.records.matched, ['rec_3', 'rec_1'])
  assert.deepEqual(state?.records.ordered, ['rec_3', 'rec_1'])
  assert.deepEqual(state?.records.visible, ['rec_3', 'rec_1'])
  assert.deepEqual(
    state?.items.ids.map(itemId => state.items.get(itemId)?.recordId),
    ['rec_3', 'rec_1']
  )
})

test('engine.active.state removes deleted records from filtered query results and item lists', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).filters.add(FIELD_STATUS)
  openView(engine, VIEW_TABLE).filters.update(0, {
    fieldId: FIELD_STATUS,
    presetId: 'eq',
    value: 'doing'
  })
  engine.records.remove('rec_2')

  const state = readViewState(engine)

  assert.deepEqual(state?.records.visible, [])
  assert.deepEqual(state?.items.ids, [])
  assert.deepEqual(
    state?.sections.all.map(section => ({
      key: section.key,
      recordIds: section.itemIds.map(itemId => state.items.get(itemId)?.recordId)
    })),
    [{
      key: 'root',
      recordIds: []
    }]
  )
})

test('engine.active.state grouped sections keep visible record order inside each bucket', () => {
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

  const engine = createEngineForTest({
    document
  })

  openView(engine, VIEW_TABLE).sort.keepOnly(FIELD_POINTS, 'desc')
  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)

  const state = readViewState(engine)
  const sections = state?.sections.all
  const items = state?.items
  const todoIds = sections
    ?.find(section => section.key === 'todo')
    ?.itemIds
    .map(id => items?.get(id)?.recordId)

  assert.deepEqual(todoIds, ['rec_4', 'rec_1'])
})

test('engine.active.state summaries are derived from index aggregates', () => {
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

  const engine = createEngineForTest({
    document
  })

  openView(engine, VIEW_TABLE).summary.set(FIELD_POINTS, 'median')
  openView(engine, VIEW_TABLE).summary.set(FIELD_STATUS, 'countUniqueValues')

  let summaries = readViewState(engine)?.summaries
  let root = summaries?.get('root')

  assert.equal(root?.get(FIELD_POINTS)?.kind, 'scalar')
  assert.equal(root?.get(FIELD_POINTS)?.value, 2.5)
  assert.equal(root?.get(FIELD_STATUS)?.kind, 'scalar')
  assert.equal(root?.get(FIELD_STATUS)?.value, 3)

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_STATUS, 'percentByOption')

  summaries = readViewState(engine)?.summaries
  const todo = summaries?.get('todo')
  const todoMedian = todo?.get(FIELD_POINTS)
  const todoStatus = todo?.get(FIELD_STATUS)

  assert.equal(todoMedian?.kind, 'scalar')
  assert.equal(todoMedian?.value, 2.5)
  assert.equal(todoStatus?.kind, 'distribution')
  assert.equal(todoStatus?.items[0]?.key, 'todo')
  assert.equal(todoStatus?.items[0]?.percent, 1)
})

test('engine.active sync reuses unaffected grouped sections and summaries on data changes', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_POINTS, 'sum')

  const stateBefore = readViewState(engine)
  const recordsBefore = stateBefore?.records
  const sectionsBefore = stateBefore?.sections.all
  const itemsBefore = stateBefore?.items
  const summariesBefore = stateBefore?.summaries
  const doingSectionBefore = sectionsBefore?.find(section => section.key === 'doing')
  const doneSectionBefore = sectionsBefore?.find(section => section.key === 'done')
  const doingSummaryBefore = summariesBefore?.get('doing')
  const doneSummaryBefore = summariesBefore?.get('done')
  const doingItemBefore = doingSectionBefore?.itemIds[0]
    ? itemsBefore?.get(doingSectionBefore.itemIds[0])
    : undefined

  engine.records.fields.set('rec_1', FIELD_STATUS, 'done')

  const stateAfter = readViewState(engine)
  const recordsAfter = stateAfter?.records
  const sectionsAfter = stateAfter?.sections.all
  const itemsAfter = stateAfter?.items
  const summariesAfter = stateAfter?.summaries
  const doingSectionAfter = sectionsAfter?.find(section => section.key === 'doing')
  const doneSectionAfter = sectionsAfter?.find(section => section.key === 'done')
  const doingItemAfter = doingSectionAfter?.itemIds[0]
    ? itemsAfter?.get(doingSectionAfter.itemIds[0])
    : undefined

  assert.equal(recordsAfter, recordsBefore)
  assert.equal(doingSectionAfter, doingSectionBefore)
  assert.notEqual(doneSectionAfter, doneSectionBefore)
  assert.equal(doingItemAfter, doingItemBefore)
  assert.equal(summariesAfter?.get('doing'), doingSummaryBefore)
  assert.notEqual(summariesAfter?.get('done'), doneSummaryBefore)
  assert.deepEqual(viewSectionRecordIds(engine, 'todo'), [])
  assert.deepEqual(viewSectionRecordIds(engine, 'done'), ['rec_1', 'rec_3'])
})

test('engine.active reconcile keeps undo redo equivalent across sequential deltas', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_POINTS, 'sum')

  const initial = viewSnapshot(engine)

  engine.records.fields.set('rec_1', FIELD_POINTS, 10)
  const afterPoints = viewSnapshot(engine)

  engine.records.fields.set('rec_1', FIELD_STATUS, 'doing')
  const afterGroupMove = viewSnapshot(engine)

  assert.equal(engine.history.canUndo(), true)
  assert.equal(engine.history.canRedo(), false)

  engine.history.undo()
  assert.deepEqual(viewSnapshot(engine), afterPoints)

  engine.history.undo()
  assert.deepEqual(viewSnapshot(engine), initial)
  assert.equal(engine.history.canRedo(), true)

  engine.history.redo()
  assert.deepEqual(viewSnapshot(engine), afterPoints)

  engine.history.redo()
  assert.deepEqual(viewSnapshot(engine), afterGroupMove)
})

test('engine.performance traces active view derive and snapshot behavior for incremental updates', () => {
  const engine = createEngineForTest({
    document: createDocument(),
    perf: {
      trace: true,
      stats: true
    }
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_POINTS, 'sum')
  engine.performance.traces.clear()
  engine.performance.stats.clear()

  engine.records.fields.set('rec_1', FIELD_STATUS, 'done')

  const trace = engine.performance.traces.last()
  const stats = engine.performance.stats.snapshot()
  const sectionsStage = trace?.view.stages.find(stage => stage.stage === 'sections')
  const summaryStage = trace?.view.stages.find(stage => stage.stage === 'summary')

  assert.ok(trace)
  assert.equal(trace.kind, 'dispatch')
  assert.equal(trace.impact.summary.records, true)
  assert.equal(trace.impact.summary.indexes, true)
  assert.equal(trace.view.plan.query, 'reuse')
  assert.equal(trace.view.plan.sections, 'sync')
  assert.equal(trace.view.plan.summary, 'sync')
  assert.equal(trace.index.group.action, 'sync')
  assert.equal(trace.index.summaries.action, 'reuse')
  assert.ok(trace.snapshot.changedStores.includes('sections'))
  assert.ok(trace.snapshot.changedStores.includes('items'))
  assert.ok(trace.snapshot.changedStores.includes('summaries'))
  assert.equal(sectionsStage?.action, 'sync')
  assert.equal(summaryStage?.action, 'sync')
  assert.ok((sectionsStage?.metrics?.reusedNodeCount ?? 0) >= 2)
  assert.ok((summaryStage?.metrics?.reusedNodeCount ?? 0) >= 1)
  assert.equal(stats.commits.total, 1)
  assert.equal(stats.commits.dispatch, 1)
  assert.equal(stats.stages.sections.sync, 1)
  assert.equal(stats.indexes.group.changed, 1)
})

test('view.create resolves duplicate names in the write planner', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  const result = engine.dispatch({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  })

  const createdViewId = result.created?.views?.[0]
  assert.ok(createdViewId)
  assert.equal(engine.select.views.byId.get(createdViewId)?.name, 'Tasks 2')
})

test('engine.views.duplicate reuses the shared unique naming rule', () => {
  const engine = createEngineForTest({
    document: createEmptyDocument()
  })

  const sourceViewId = engine.dispatch({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  }).created?.views?.[0]

  assert.ok(sourceViewId)

  engine.dispatch({
    type: 'view.create',
    input: {
      name: 'Tasks Copy',
      type: 'table'
    }
  })

  const createdViewId = engine.views.duplicate(sourceViewId)
  assert.ok(createdViewId)
  assert.equal(engine.select.views.byId.get(createdViewId)?.name, 'Tasks Copy 2')
})
