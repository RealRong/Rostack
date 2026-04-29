import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import {
  createDataviewProjection
} from '@dataview/engine/projection'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

const createView = (input?: {
  wrap?: boolean
}) => ({
  id: VIEW_ID,
  type: 'table' as const,
  name: 'Tasks',
  filter: {
    mode: 'and' as const,
    rules: entityTable.normalize.list([])
  },
  search: {
    query: ''
  },
  sort: {
    rules: entityTable.normalize.list([])
  },
  group: {
    fieldId: FIELD_STATUS,
    showEmpty: true
  },
  calc: {
    [FIELD_POINTS]: 'sum' as const
  },
  display: {
    fields: ['title', FIELD_STATUS, FIELD_POINTS]
  },
  options: {
    widths: {},
    showVerticalLines: true,
    wrap: input?.wrap ?? false
  },
  orders: []
})

const createDocument = (view = createView()) => ({
  schemaVersion: 1,
  activeViewId: view.id,
  fields: {
    byId: {
      [FIELD_STATUS]: {
        id: FIELD_STATUS,
        name: 'Status',
        kind: 'status',
        defaultOptionId: 'todo',
        options: [
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
          }
        ]
      },
      [FIELD_POINTS]: {
        id: FIELD_POINTS,
        name: 'Points',
        kind: 'number',
        format: 'number',
        precision: null,
        currency: null,
        useThousandsSeparator: false
      }
    },
    ids: [FIELD_STATUS, FIELD_POINTS]
  },
  views: {
    byId: {
      [view.id]: view
    },
    ids: [view.id]
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
          [FIELD_POINTS]: 3
        }
      }
    },
    ids: ['rec_1', 'rec_2']
  },
  meta: {}
})

const createEmptyDocument = () => ({
  schemaVersion: 1,
  activeViewId: undefined,
  fields: {
    byId: {
      [FIELD_STATUS]: {
        id: FIELD_STATUS,
        name: 'Status',
        kind: 'status',
        defaultOptionId: 'todo',
        options: [{
          id: 'todo',
          name: 'Todo',
          color: 'gray',
          category: 'todo'
        }]
      },
      [FIELD_POINTS]: {
        id: FIELD_POINTS,
        name: 'Points',
        kind: 'number',
        format: 'number',
        precision: null,
        currency: null,
        useThousandsSeparator: false
      }
    },
    ids: [FIELD_STATUS, FIELD_POINTS]
  },
  views: {
    byId: {},
    ids: []
  },
  records: {
    byId: {},
    ids: []
  },
  meta: {}
})

test('createDataviewProjection bootstraps a single six-phase runtime', () => {
  const runtime = createDataviewProjection()

  const result = runtime.update({
    document: createDocument(),
    delta: {
      reset: true
    },
    runtime: {}
  })

  assert.deepEqual(
    result.trace.phases.map((phase) => phase.name),
    ['document', 'index', 'query', 'membership', 'summary', 'view']
  )
  assert.equal(result.output.activeViewId, VIEW_ID)
  assert.equal(result.output.active?.items.count, 2)
  assert.equal(result.output.active?.summaries.size, result.output.active?.sections.count)
  assert.equal(runtime.stores.items.ids.get().length, 2)
  assert.equal(runtime.stores.sections.ids.get().length, result.output.active?.sections.count)
})

test('layout mutation stays inside the single runtime and only mutates view surface', () => {
  const runtime = createDataviewProjection()
  runtime.update({
    document: createDocument(),
    delta: {
      reset: true
    },
    runtime: {}
  })

  const result = runtime.update({
    document: createDocument(createView({
      wrap: true
    })),
    delta: {
      changes: {
        'view.layout': [VIEW_ID]
      }
    },
    runtime: {}
  })

  assert.deepEqual(
    result.trace.phases.map((phase) => ({
      name: phase.name,
      changed: phase.changed
    })),
    [{
      name: 'document',
      changed: true
    }, {
      name: 'index',
      changed: false
    }, {
      name: 'query',
      changed: false
    }, {
      name: 'membership',
      changed: false
    }, {
      name: 'summary',
      changed: false
    }, {
      name: 'view',
      changed: true
    }]
  )
  assert.equal(result.output.active?.table.wrap, true)
})

test('single runtime clears active snapshot when active view disappears', () => {
  const runtime = createDataviewProjection()
  runtime.update({
    document: createDocument(),
    delta: {
      reset: true
    },
    runtime: {}
  })

  const result = runtime.update({
    document: createEmptyDocument(),
    delta: {
      changes: {
        'document.activeViewId': true
      }
    },
    runtime: {}
  })

  assert.deepEqual(
    result.trace.phases.map((phase) => phase.name),
    ['document', 'index', 'query', 'membership', 'summary', 'view']
  )
  assert.equal(result.output.active, undefined)
  assert.equal(runtime.stores.active.get(), undefined)
})
