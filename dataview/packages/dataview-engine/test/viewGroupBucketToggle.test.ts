import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  KANBAN_EMPTY_BUCKET_KEY,
  TITLE_FIELD_ID
} from '@dataview/core/types'
import { filter } from '@dataview/core/view'
import { view } from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import { dataviewSpec } from '@dataview/react'
import { entityTable } from '@shared/core'

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

const createFieldTable = fields => entityTable.normalize.list(fields)

const createEmptyFilter = () => ({
  mode: 'and' as const,
  rules: entityTable.normalize.list([])
})

const createEmptySort = () => ({
  rules: entityTable.normalize.list([])
})

const addFilterRule = (active, fieldId, patch) => {
  const id = active.filters.create(fieldId)
  active.filters.patch(id, patch)
  return id
}

const setSingleSortRule = (active, fieldId, direction) => {
  active.sort.clear()
  return active.sort.create(fieldId, direction)
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
          filter: createEmptyFilter(),
          search: {
            query: ''
          },
          sort: createEmptySort(),
          calc: {},
          display: {
            fields: [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS]
          },
          options: {
            ...view.options.defaults('table', fields)
          },
          orders: []
        }
      },
      ids: [VIEW_TABLE]
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
      ids: ['rec_1', 'rec_2', 'rec_3']
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
    filter: createEmptyFilter(),
    search: {
      query: ''
    },
    sort: createEmptySort(),
    calc: {},
    display: {
      fields: [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS]
    },
    options: {
      ...view.options.defaults(input.type ?? 'table', fields)
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
            fieldId: FIELD_STATUS,
            mode: 'option',
            bucketSort: 'manual',
            showEmpty: true
          }
        })
      },
      ids: [VIEW_TABLE, VIEW_BOARD]
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
      ids: ['rec_1']
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
      ids: []
    },
    records: {
      byId: {},
      ids: []
    },
    meta: {}
  }
}

const createEngineForTest = options => createEngine({
  spec: dataviewSpec,
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

const applyHistory = (engine, kind) => {
  const history = engine.history
  if (!history) {
    return false
  }

  const result = kind === 'undo'
    ? history.undo()
    : history.redo()
  return result.ok
}

const readViewState = engine => engine.active.state()

const itemIdByRecordId = (engine, recordId) => {
  const items = readViewState(engine)?.items
  if (!items) {
    return undefined
  }

  return items.ids.find(itemId => items.read.record(itemId) === recordId)
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
    ? state.items.read.section(beforeItemId)
    : state.items.read.section(itemIds[0]!) ?? state.sections.ids[0]
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

const viewSectionRecordIds = (engine, sectionId) => {
  const state = readViewState(engine)
  return [...(state?.sections.get(sectionId)?.recordIds ?? [])]
}

const assertPublishedItemsMatchSections = engine => {
  const state = readViewState(engine)
  const visibleSectionItems = (state?.sections.all ?? []).flatMap(section => (
    section.collapsed
      ? []
      : section.itemIds
  ))

  state?.sections.all.forEach(section => {
    assert.equal(
      section.itemIds.length,
      section.recordIds.length,
      `section ${section.id} should publish one item per record`
    )
  })
  assert.deepEqual(state?.items.ids, visibleSectionItems)
  assert.equal(state?.items.count, visibleSectionItems.length)
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
      id: section.id,
      collapsed: section.collapsed,
      recordIds: viewSectionRecordIds(engine, section.id)
    })),
    summaries: Object.fromEntries(
      Array.from(state?.summaries.entries() ?? []).map(([sectionId, collection]) => [
        sectionId,
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

  let view = engine.views.get(VIEW_TABLE)!
  let sections = readViewState(engine)?.sections.all ?? []

  assert.deepEqual(view.group.buckets, {
    todo: {
      collapsed: true
    }
  })
  assert.equal(
    sections.find(section => section.id === 'todo')?.collapsed,
    true
  )

  openView(engine, VIEW_TABLE).sections.toggleCollapse('todo')

  view = engine.views.get(VIEW_TABLE)!
  sections = readViewState(engine)?.sections.all ?? []

  assert.equal(view.group?.buckets, undefined)
  assert.equal(
    sections.find(section => section.id === 'todo')?.collapsed,
    false
  )
})

test('view group interval set clears back to the field default when value is undefined', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_POINTS)

  let view = engine.views.get(VIEW_TABLE)!
  assert.equal(view.group?.bucketInterval, 10)

  openView(engine, VIEW_TABLE).group.setInterval(5)
  view = engine.views.get(VIEW_TABLE)!
  assert.equal(view.group?.bucketInterval, 5)

  openView(engine, VIEW_TABLE).group.setInterval(undefined)
  view = engine.views.get(VIEW_TABLE)!
  assert.equal(view.group?.bucketInterval, 10)
})

test('kanban cards per column defaults to all and persists through the view api', () => {
  const fields = createFields()

  assert.equal(
    view.options.defaults('kanban', fields).cardsPerColumn,
    25
  )

  const document = createDocument()
  document.views.byId[VIEW_BOARD] = createView({
    id: VIEW_BOARD,
    type: 'kanban',
    name: 'Board',
    group: {
      fieldId: FIELD_STATUS,
      mode: 'option',
      bucketSort: 'manual',
      showEmpty: true
    }
  })
  document.views.ids.push(VIEW_BOARD)

  const engine = createEngineForTest({
    document
  })

  let board = engine.views.get(VIEW_BOARD)!
  assert.equal(board.options.cardsPerColumn, 25)

  openView(engine, VIEW_BOARD).kanban.setCardsPerColumn(25)
  board = engine.views.get(VIEW_BOARD)!
  assert.equal(board.options.cardsPerColumn, 25)

  openView(engine, VIEW_BOARD).kanban.setCardsPerColumn(100)
  board = engine.views.get(VIEW_BOARD)!
  assert.equal(board.options.cardsPerColumn, 100)

  openView(engine, VIEW_BOARD).kanban.setCardsPerColumn('all')
  board = engine.views.get(VIEW_BOARD)!
  assert.equal(board.options.cardsPerColumn, 'all')
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
    engine.views.get(createdId!)?.group?.fieldId,
    FIELD_STATUS
  )

  openView(engine, VIEW_TABLE).changeType('kanban')
  assert.equal(engine.active.view()?.type, 'kanban')
  assert.equal(engine.active.view()?.group?.fieldId, FIELD_STATUS)
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
  assert.equal(engine.views.get(createdId!)?.group?.fieldId, FIELD_STATUS)
})

test('engine.subscribe keeps active boundaries inside one active pipeline', () => {
  const engine = createEngineForTest({
    document: createMultiViewDocument()
  })

  let previousViewId = engine.active.id()
  let idEvents = 0
  let sortEvents = 0
  const unsubscribe = engine.subscribe(result => {
    const nextViewId = result.active?.view.id
    if (nextViewId !== previousViewId) {
      idEvents += 1
      previousViewId = nextViewId
    }
    if (result.active?.query.sort.rules.length) {
      sortEvents += 1
    }
  })

  assert.equal(engine.active.id(), VIEW_TABLE)
  assert.equal(readViewState(engine)?.query.group, undefined)
  assert.equal(readViewState(engine)?.query.sort.rules.length, 0)

  openView(engine, VIEW_TABLE).sort.create(FIELD_POINTS)

  assert.equal(engine.active.id(), VIEW_TABLE)
  assert.equal(readViewState(engine)?.query.sort.rules.length, 1)
  assert.equal(readViewState(engine)?.query.sort.rules[0]?.rule.fieldId, FIELD_POINTS)
  assert.equal(idEvents, 0)
  assert.equal(sortEvents, 1)

  engine.views.open(VIEW_BOARD)

  assert.equal(engine.active.id(), VIEW_BOARD)
  assert.ok(readViewState(engine)?.query.group)
  assert.equal(readViewState(engine)?.query.group.fieldId, FIELD_STATUS)
  assert.equal(idEvents, 1)

  unsubscribe()
})

test('engine.replace(system origin) publishes coherent active view state in one step', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })
  const nextDocument = createMultiViewDocument()
  let documentEvents = 0

  const unsubscribe = engine.subscribe(() => {
    documentEvents += 1
    assert.equal(engine.doc().activeViewId, VIEW_TABLE)
    assert.equal(engine.active.id(), VIEW_TABLE)
    assert.deepEqual(readViewState(engine)?.records.visible, ['rec_1'])
  })

  engine.replace(nextDocument, {
    origin: 'system'
  })

  assert.equal(documentEvents, 1)
  assert.equal(engine.active.id(), VIEW_TABLE)
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
  assert.deepEqual(sections?.map(section => section.id), ['todo', 'doing', 'done', '(empty)'])
  assert.equal(items?.ids.length, 3)
  assert.deepEqual(fields?.ids, [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS])
  assert.deepEqual(
    fields?.all.filter(field => field.kind !== 'title').map(field => field.id),
    [FIELD_STATUS, FIELD_POINTS]
  )
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
  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['done'])
  })
  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_3']
  )

  openView(engine, VIEW_TABLE).filters.clear()
  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')
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

test('engine.active.state keeps grouped section items aligned when filters are added and removed', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)

  const todoItemBefore = itemIdByRecordId(engine, 'rec_1')
  const doingItemBefore = itemIdByRecordId(engine, 'rec_2')
  const doneItemBefore = itemIdByRecordId(engine, 'rec_3')

  assertPublishedItemsMatchSections(engine)

  const filterId = addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['done'])
  })

  assert.deepEqual(readViewState(engine)?.records.visible, ['rec_3'])
  assertPublishedItemsMatchSections(engine)

  openView(engine, VIEW_TABLE).filters.remove(filterId)

  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_1', 'rec_2', 'rec_3']
  )
  assertPublishedItemsMatchSections(engine)
  assert.equal(itemIdByRecordId(engine, 'rec_1'), todoItemBefore)
  assert.equal(itemIdByRecordId(engine, 'rec_2'), doingItemBefore)
  assert.equal(itemIdByRecordId(engine, 'rec_3'), doneItemBefore)
})

test('engine.active.state removes deleted records from sorted query results and item lists', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')
  engine.records.remove('rec_2')

  const state = readViewState(engine)

  assert.deepEqual(state?.records.matched, ['rec_3', 'rec_1'])
  assert.deepEqual(state?.records.ordered, ['rec_3', 'rec_1'])
  assert.deepEqual(state?.records.visible, ['rec_3', 'rec_1'])
  assert.deepEqual(
    state?.items.ids.map(itemId => state.items.read.record(itemId)),
    ['rec_3', 'rec_1']
  )
})

test('engine.active.state removes deleted records from filtered query results and item lists', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['doing'])
  })
  engine.records.remove('rec_2')

  const state = readViewState(engine)

  assert.deepEqual(state?.records.visible, [])
  assert.deepEqual(state?.items.ids, [])
  assert.deepEqual(
    state?.sections.all.map(section => ({
      id: section.id,
      recordIds: section.recordIds
    })),
    [{
      id: 'root',
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
  document.records.ids = ['rec_1', 'rec_2', 'rec_3', 'rec_4']

  const engine = createEngineForTest({
    document
  })

  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')
  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)

  const state = readViewState(engine)
  const sections = state?.sections.all
  const todoIds = sections
    ?.find(section => section.id === 'todo')
    ?.recordIds

  assert.deepEqual(todoIds, ['rec_4', 'rec_1'])
})

test('engine.active.state grouped sections reorder when sort changes after grouping', () => {
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
  document.records.ids = ['rec_1', 'rec_2', 'rec_3', 'rec_4']

  const engine = createEngineForTest({
    document
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  assert.deepEqual(viewSectionRecordIds(engine, 'todo'), ['rec_1', 'rec_4'])

  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')

  assert.deepEqual(viewSectionRecordIds(engine, 'todo'), ['rec_4', 'rec_1'])
})

test('engine.active.state sort reorders records without reallocating item ids', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  const rec1ItemId = itemIdByRecordId(engine, 'rec_1')
  const rec2ItemId = itemIdByRecordId(engine, 'rec_2')
  const rec3ItemId = itemIdByRecordId(engine, 'rec_3')

  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')
  const state = readViewState(engine)
  const itemRecordIds = state
    ? state.items.ids.map(itemId => state.items.read.record(itemId))
    : undefined

  assert.deepEqual(itemRecordIds, ['rec_3', 'rec_2', 'rec_1'])
  assert.equal(itemIdByRecordId(engine, 'rec_1'), rec1ItemId)
  assert.equal(itemIdByRecordId(engine, 'rec_2'), rec2ItemId)
  assert.equal(itemIdByRecordId(engine, 'rec_3'), rec3ItemId)
})

test('engine.active.records.create inserts before the target item when sort is inactive', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  const beforeItemId = itemIdByRecordId(engine, 'rec_2')
  const createdId = openView(engine, VIEW_TABLE).records.create({
    before: beforeItemId,
    values: {
      [TITLE_FIELD_ID]: 'Inserted'
    }
  })

  assert.ok(createdId)
  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_1', createdId, 'rec_2', 'rec_3']
  )
})

test('engine.active.records.create derives the group field from section', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  const createdId = openView(engine, VIEW_TABLE).records.create({
    section: 'doing',
    values: {
      [TITLE_FIELD_ID]: 'Grouped'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[FIELD_STATUS], 'doing')
  assert.deepEqual(viewSectionRecordIds(engine, 'doing'), ['rec_2', createdId])
})

test('engine.active.records.create clears status defaults when creating in the empty bucket', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  const createdId = openView(engine, VIEW_TABLE).records.create({
    section: KANBAN_EMPTY_BUCKET_KEY,
    values: {
      [TITLE_FIELD_ID]: 'Inbox'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[FIELD_STATUS], undefined)
  assert.deepEqual(
    viewSectionRecordIds(engine, KANBAN_EMPTY_BUCKET_KEY),
    [createdId]
  )
})

test('engine.active.records.create derives supported filter defaults', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['doing'])
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    values: {
      [TITLE_FIELD_ID]: 'Filtered'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[FIELD_STATUS], 'doing')
  assert.deepEqual(readViewState(engine)?.records.visible, ['rec_2', createdId])
})

test('engine.active.records.create supports multiple concrete select filters and multiSelect contains defaults', () => {
  const fieldA = 'select_1'
  const fieldB = 'select_2'
  const fieldC = 'tags'
  const fields = [
    {
      id: fieldA,
      name: 'Select 1',
      kind: 'select',
      options: [
        {
          id: 'option_1',
          name: 'Option 1',
          color: 'red'
        }
      ]
    },
    {
      id: fieldB,
      name: 'Select 2',
      kind: 'select',
      options: [
        {
          id: 'option_2',
          name: 'Option 2',
          color: 'blue'
        },
        {
          id: 'option_3',
          name: 'Option 3',
          color: 'green'
        }
      ]
    },
    {
      id: fieldC,
      name: 'Tags',
      kind: 'multiSelect',
      options: [
        {
          id: 'option_3',
          name: 'Option 3',
          color: 'green'
        },
        {
          id: 'option_4',
          name: 'Option 4',
          color: 'orange'
        }
      ]
    }
  ]

  const engine = createEngineForTest({
    document: {
      schemaVersion: 1,
      fields: createFieldTable(fields),
      views: {
        byId: {
          [VIEW_TABLE]: {
            id: VIEW_TABLE,
            type: 'table',
            name: 'Tasks',
            filter: createEmptyFilter(),
            search: {
              query: ''
            },
            sort: createEmptySort(),
            calc: {},
            display: {
              fields: [TITLE_FIELD_ID, fieldA, fieldB, fieldC]
            },
            options: {
              ...view.options.defaults('table', fields)
            },
            orders: []
          }
        },
        ids: [VIEW_TABLE]
      },
      records: {
        byId: {},
        ids: []
      },
      meta: {}
    }
  })

  addFilterRule(openView(engine, VIEW_TABLE), fieldA, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['option_1'])
  })
  addFilterRule(openView(engine, VIEW_TABLE), fieldB, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['option_2', 'option_3'])
  })
  addFilterRule(openView(engine, VIEW_TABLE), fieldC, {
    presetId: 'contains',
    value: filter.value.optionSet.create(['option_4'])
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    values: {
      [TITLE_FIELD_ID]: 'Filtered'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[fieldA], 'option_1')
  assert.equal(engine.records.get(createdId)?.values[fieldB], 'option_2')
  assert.deepEqual(engine.records.get(createdId)?.values[fieldC], ['option_4'])
  assert.deepEqual(readViewState(engine)?.records.visible, [createdId])
})

test('engine.active.records.create resolves grouped status against multi-option filters', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['todo', 'doing'])
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    section: 'doing',
    values: {
      [TITLE_FIELD_ID]: 'Grouped Filtered'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[FIELD_STATUS], 'doing')
  assert.deepEqual(viewSectionRecordIds(engine, 'doing'), ['rec_2', createdId])
})

test('engine.active.records.create chooses the first option from multi-option status filters', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['todo', 'doing'])
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    values: {
      [TITLE_FIELD_ID]: 'Ambiguous'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[FIELD_STATUS], 'todo')
  assert.deepEqual(readViewState(engine)?.records.visible, ['rec_1', 'rec_2', createdId])
})

test('engine.active.records.create accepts explicit status values that satisfy multi-option filters', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['todo', 'doing'])
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    values: {
      [TITLE_FIELD_ID]: 'Explicit',
      [FIELD_STATUS]: 'doing'
    }
  })

  assert.ok(createdId)
  assert.equal(engine.records.get(createdId)?.values[FIELD_STATUS], 'doing')
  assert.deepEqual(readViewState(engine)?.records.visible, ['rec_1', 'rec_2', createdId])
})

test('engine.active.records.create rejects unsupported effective filter rules', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })
  const beforeOrder = [...engine.doc().records.ids]

  addFilterRule(openView(engine, VIEW_TABLE), TITLE_FIELD_ID, {
    presetId: 'contains',
    value: 'Task'
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    values: {
      [TITLE_FIELD_ID]: 'Blocked'
    }
  })

  assert.equal(createdId, undefined)
  assert.deepEqual(engine.doc().records.ids, beforeOrder)
})

test('engine.active.records.create rejects explicit values that conflict with the target section', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })
  const beforeOrder = [...engine.doc().records.ids]

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)

  const createdId = openView(engine, VIEW_TABLE).records.create({
    section: 'doing',
    values: {
      [TITLE_FIELD_ID]: 'Wrong Group',
      [FIELD_STATUS]: 'todo'
    }
  })

  assert.equal(createdId, undefined)
  assert.deepEqual(engine.doc().records.ids, beforeOrder)
})

test('engine.active.records.create rejects conflicting group and filter defaults', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })
  const beforeOrder = [...engine.doc().records.ids]

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  addFilterRule(openView(engine, VIEW_TABLE), FIELD_STATUS, {
    presetId: 'eq',
    value: filter.value.optionSet.create(['doing'])
  })

  const createdId = openView(engine, VIEW_TABLE).records.create({
    section: 'todo',
    values: {
      [TITLE_FIELD_ID]: 'Conflict'
    }
  })

  assert.equal(createdId, undefined)
  assert.deepEqual(engine.doc().records.ids, beforeOrder)
})

test('engine.active.records.create uses before as context only when sort is active', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')
  const beforeItemId = itemIdByRecordId(engine, 'rec_1')
  const createdId = openView(engine, VIEW_TABLE).records.create({
    before: beforeItemId,
    values: {
      [TITLE_FIELD_ID]: 'Low Priority',
      [FIELD_POINTS]: 0
    }
  })

  assert.ok(createdId)
  assert.deepEqual(
    readViewState(engine)?.records.visible,
    ['rec_3', 'rec_2', 'rec_1', createdId]
  )
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
  document.records.ids = ['rec_1', 'rec_2', 'rec_3', 'rec_4']

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

test('engine.active.state clears grouped summaries when filters leave every section empty', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_STATUS, 'countByOption')

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_POINTS, {
    presetId: 'gt',
    value: 100
  })

  const state = readViewState(engine)
  const summaries = state?.summaries

  assert.deepEqual(state?.records.visible, [])
  assert.deepEqual(viewSectionRecordIds(engine, 'todo'), [])
  assert.deepEqual(viewSectionRecordIds(engine, 'doing'), [])
  assert.deepEqual(viewSectionRecordIds(engine, 'done'), [])
  assert.equal(summaries?.get('todo')?.get(FIELD_STATUS)?.kind, 'empty')
  assert.equal(summaries?.get('doing')?.get(FIELD_STATUS)?.kind, 'empty')
  assert.equal(summaries?.get('done')?.get(FIELD_STATUS)?.kind, 'empty')
})

test('engine.active state clears grouped summaries when filters leave every section empty', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_STATUS, 'countByOption')

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_POINTS, {
    presetId: 'gt',
    value: 100
  })

  assert.equal(
    engine.active.state()?.summaries.get('todo')?.get(FIELD_STATUS)?.kind,
    'empty'
  )
  assert.equal(
    engine.active.state()?.summaries.get('doing')?.get(FIELD_STATUS)?.kind,
    'empty'
  )
  assert.equal(
    engine.active.state()?.summaries.get('done')?.get(FIELD_STATUS)?.kind,
    'empty'
  )
})

test('engine.performance syncs summaries when grouped filters change visible membership', () => {
  const engine = createEngineForTest({
    document: createDocument(),
    perf: {
      trace: true,
      stats: true
    }
  })

  openView(engine, VIEW_TABLE).group.set(FIELD_STATUS)
  openView(engine, VIEW_TABLE).summary.set(FIELD_STATUS, 'countByOption')
  engine.performance.traces.clear()
  engine.performance.stats.clear()

  addFilterRule(openView(engine, VIEW_TABLE), FIELD_POINTS, {
    presetId: 'gt',
    value: 100
  })

  const trace = engine.performance.traces.last()
  const summaryStage = trace?.view.stages.find(stage => stage.stage === 'summary')

  assert.equal(readViewState(engine)?.summaries.get('todo')?.get(FIELD_STATUS)?.kind, 'empty')
  assert.equal(readViewState(engine)?.summaries.get('doing')?.get(FIELD_STATUS)?.kind, 'empty')
  assert.equal(readViewState(engine)?.summaries.get('done')?.get(FIELD_STATUS)?.kind, 'empty')
  assert.ok(trace)
  assert.equal(trace.view.plan.summary, 'sync')
  assert.equal(summaryStage?.action, 'sync')
  assert.equal(trace.snapshot.changedStores.includes('summaries'), true)
})

test('engine.performance reuses summaries when sort only reorders records', () => {
  const engine = createEngineForTest({
    document: createDocument(),
    perf: {
      trace: true,
      stats: true
    }
  })

  openView(engine, VIEW_TABLE).summary.set(FIELD_POINTS, 'sum')
  const summariesBefore = readViewState(engine)?.summaries
  engine.performance.traces.clear()
  engine.performance.stats.clear()

  setSingleSortRule(openView(engine, VIEW_TABLE), FIELD_POINTS, 'desc')

  const trace = engine.performance.traces.last()
  const summaryStage = trace?.view.stages.find(stage => stage.stage === 'summary')

  assert.equal(readViewState(engine)?.summaries, summariesBefore)
  assert.ok(trace)
  assert.equal(trace.view.plan.query, 'sync')
  assert.equal(trace.view.plan.membership, 'sync')
  assert.equal(trace.view.plan.summary, 'reuse')
  assert.equal(summaryStage?.action, 'reuse')
  assert.equal(trace.snapshot.changedStores.includes('summaries'), false)
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
  const doingSectionBefore = sectionsBefore?.find(section => section.id === 'doing')
  const doneSectionBefore = sectionsBefore?.find(section => section.id === 'done')
  const doingSummaryBefore = summariesBefore?.get('doing')
  const doneSummaryBefore = summariesBefore?.get('done')
  const doingItemBefore = doingSectionBefore?.itemIds[0]
    ? itemsBefore?.read.placement(doingSectionBefore.itemIds[0])
    : undefined

  engine.records.fields.set('rec_1', FIELD_STATUS, 'done')

  const stateAfter = readViewState(engine)
  const recordsAfter = stateAfter?.records
  const sectionsAfter = stateAfter?.sections.all
  const itemsAfter = stateAfter?.items
  const summariesAfter = stateAfter?.summaries
  const doingSectionAfter = sectionsAfter?.find(section => section.id === 'doing')
  const doneSectionAfter = sectionsAfter?.find(section => section.id === 'done')
  const doingItemAfter = doingSectionAfter?.itemIds[0]
    ? itemsAfter?.read.placement(doingSectionAfter.itemIds[0])
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

  assert.equal(engine.history.get().canUndo, true)
  assert.equal(engine.history.get().canRedo, false)

  assert.equal(applyHistory(engine, 'undo'), true)
  assert.deepEqual(viewSnapshot(engine), afterPoints)

  assert.equal(applyHistory(engine, 'undo'), true)
  assert.deepEqual(viewSnapshot(engine), initial)
  assert.equal(engine.history.get().canRedo, true)

  assert.equal(applyHistory(engine, 'redo'), true)
  assert.deepEqual(viewSnapshot(engine), afterPoints)

  assert.equal(applyHistory(engine, 'redo'), true)
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
  const sectionsStage = trace?.view.stages.find(stage => stage.stage === 'membership')
  const summaryStage = trace?.view.stages.find(stage => stage.stage === 'summary')

  assert.ok(trace)
  assert.equal(trace.kind, 'dispatch')
  assert.equal(trace.delta.summary.records, true)
  assert.equal(trace.delta.summary.indexes, true)
  assert.equal(trace.view.plan.query, 'reuse')
  assert.equal(trace.view.plan.membership, 'sync')
  assert.equal(trace.view.plan.summary, 'sync')
  assert.equal(trace.index.bucket.action, 'sync')
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
  assert.equal(stats.stages.membership.sync, 1)
  assert.equal(stats.indexes.bucket.changed, 1)
})

test('view.create resolves duplicate names in the write planner', () => {
  const engine = createEngineForTest({
    document: createDocument()
  })

  const result = engine.execute({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  })

  const createdViewId = result.ok && result.data && 'id' in result.data
    ? result.data.id
    : undefined
  assert.ok(createdViewId)
  assert.equal(engine.views.get(createdViewId!)?.name, 'Tasks 2')
})

test('engine.views.duplicate reuses the shared unique naming rule', () => {
  const engine = createEngineForTest({
    document: createEmptyDocument()
  })

  const sourceViewCreate = engine.execute({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  })
  const sourceViewId = sourceViewCreate.ok && sourceViewCreate.data && 'id' in sourceViewCreate.data
    ? sourceViewCreate.data.id
    : undefined
  assert.ok(sourceViewId)

  engine.execute({
    type: 'view.create',
    input: {
      name: 'Tasks Copy',
      type: 'table'
    }
  })

  const createdViewId = engine.views.duplicate(sourceViewId)
  assert.ok(createdViewId)
  assert.equal(engine.views.get(createdViewId!)?.name, 'Tasks Copy 2')
})

test('engine commits stream emits shared apply commits for execute', () => {
  const engine = createEngineForTest({
    document: createEmptyDocument()
  })
  const writes = []
  const unsubscribe = engine.commits.subscribe((commit) => {
    if (commit.kind === 'apply') {
      writes.push(commit)
    }
  })

  const result = engine.execute({
    type: 'view.create',
    input: {
      name: 'Tasks',
      type: 'table'
    }
  })

  unsubscribe()
  assert.equal(result.ok, true)
  assert.equal(writes.length, 1)
  const createdViewId = result.ok && result.data && 'id' in result.data
    ? result.data.id
    : undefined
  assert.deepEqual(writes[0] && {
    kind: writes[0].kind,
    rev: writes[0].rev,
    at: writes[0].at,
    origin: writes[0].origin,
    document: writes[0].document,
    delta: writes[0].delta,
    forward: writes[0].forward,
    inverse: writes[0].inverse,
    footprint: writes[0].footprint,
    issues: writes[0].issues,
    outputs: writes[0].outputs,
    extra: writes[0].extra
  }, result.commit)
  assert.equal(writes[0]?.origin, 'user')
  assert.deepEqual(writes[0]?.delta, {
    changes: {
      'document.activeViewId': true,
      'view.create': createdViewId
        ? [createdViewId]
        : []
    }
  })
})

test('engine apply emits shared apply commits', () => {
  const engine = createEngineForTest({
    document: createEmptyDocument()
  })
  const writes = []
  const unsubscribe = engine.commits.subscribe((commit) => {
    if (commit.kind === 'apply') {
      writes.push(commit)
    }
  })

  const result = engine.apply([{
    type: 'external.version.bump',
    source: 'test'
  }], {
    origin: 'remote'
  })

  unsubscribe()
  assert.equal(result.ok, true)
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0] && {
    kind: writes[0].kind,
    rev: writes[0].rev,
    at: writes[0].at,
    origin: writes[0].origin,
    document: writes[0].document,
    delta: writes[0].delta,
    forward: writes[0].forward,
    inverse: writes[0].inverse,
    footprint: writes[0].footprint,
    issues: writes[0].issues,
    outputs: writes[0].outputs,
    extra: writes[0].extra
  }, result.commit)
  assert.equal(writes[0]?.origin, 'remote')
  assert.equal(writes[0]?.forward.length, 1)
  assert.deepEqual(writes[0]?.delta, {
    changes: {
      'external.version': true
    }
  })
})
