import assert from 'node:assert/strict'
import {
  assertPhaseOrder,
  createHarness
} from '@shared/projector/testing'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import {
  emptyNormalizedIndexDemand
} from '@dataview/engine/active/index/demand'
import {
  createIndexState
} from '@dataview/engine/active/index/runtime'
import {
  resolveViewPlan
} from '@dataview/engine/active/plan'
import {
  activeProjectorSpec
} from '@dataview/engine/active/projector/spec'
import {
  createBaseImpact
} from '@dataview/engine/active/projector/impact'
import {
  createDocumentReadContext
} from '@dataview/engine/document/reader'

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
    order: [FIELD_STATUS, FIELD_POINTS]
  },
  views: {
    byId: {
      [view.id]: view
    },
    order: [view.id]
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
    order: ['rec_1', 'rec_2']
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
        options: [
          {
            id: 'todo',
            name: 'Todo',
            color: 'gray',
            category: 'todo'
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
    order: [FIELD_STATUS, FIELD_POINTS]
  },
  views: {
    byId: {},
    order: []
  },
  records: {
    byId: {},
    order: []
  },
  meta: {}
})

const createProjectorInput = (input: {
  document: ReturnType<typeof createDocument> | ReturnType<typeof createEmptyDocument>
  previousPlan?: ReturnType<typeof resolveViewPlan>
  trace?: Parameters<typeof createBaseImpact>[0]
}) => {
  const read = createDocumentReadContext(input.document)
  const plan = resolveViewPlan(read, read.activeViewId)
  const index = createIndexState(
    input.document,
    plan?.index ?? emptyNormalizedIndexDemand()
  )

  return {
    input: {
      read: {
        reader: read.reader
      },
      view: {
        plan,
        previousPlan: input.previousPlan
      },
      index: {
        state: index
      },
      impact: createBaseImpact(input.trace ?? {})
    },
    plan
  }
}

test('engine.active.projector bootstrap fans out through query membership summary and publish', () => {
  const harness = createHarness(activeProjectorSpec)
  const {
    input
  } = createProjectorInput({
    document: createDocument()
  })

  const result = harness.update(input)

  assertPhaseOrder(result.trace, [
    'query',
    'membership',
    'summary',
    'publish'
  ])
  assert.ok(result.snapshot)
  assert.equal(result.snapshot?.items.count, 2)
  assert.equal(result.snapshot?.summaries.size, result.snapshot?.sections.count)
})

test('engine.active.projector layout change runs publish only and reuses query results', () => {
  const harness = createHarness(activeProjectorSpec)
  const bootstrap = createProjectorInput({
    document: createDocument()
  })
  const previous = harness.update(bootstrap.input)
  const layoutDocument = createDocument(createView({
    wrap: true
  }))
  const {
    input
  } = createProjectorInput({
    document: layoutDocument,
    previousPlan: bootstrap.plan,
    trace: {
      views: {
        changed: new Map([
          [VIEW_ID, {
            layoutAspects: new Set(['wrap'])
          }]
        ])
      }
    }
  })

  const result = harness.update(input)

  assertPhaseOrder(result.trace, ['query', 'membership', 'summary', 'publish'])
  assert.deepEqual(
    result.trace.phases.map(phase => ({
      name: phase.name,
      action: phase.action
    })),
    [{
      name: 'query',
      action: 'reuse'
    }, {
      name: 'membership',
      action: 'reuse'
    }, {
      name: 'summary',
      action: 'reuse'
    }, {
      name: 'publish',
      action: 'sync'
    }]
  )
  assert.equal(result.snapshot?.table.wrap, true)
  assert.equal(result.snapshot?.records, previous.snapshot?.records)
  assert.equal(result.snapshot?.sections, previous.snapshot?.sections)
})

test('engine.active.projector resets through publish scope when no active view remains', () => {
  const harness = createHarness(activeProjectorSpec)
  const bootstrap = createProjectorInput({
    document: createDocument()
  })

  harness.update(bootstrap.input)

  const {
    input
  } = createProjectorInput({
    document: createEmptyDocument(),
    previousPlan: bootstrap.plan
  })
  const result = harness.update(input)

  assertPhaseOrder(result.trace, ['publish'])
  assert.equal(result.snapshot, undefined)
  assert.deepEqual(result.change, {
    reset: true
  })
})
