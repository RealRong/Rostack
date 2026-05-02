import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { createMutationDelta } from '@shared/mutation'
import { dataviewMutationModel } from '@dataview/core/mutation'
import { createDataviewFrame } from '@dataview/engine/active/frame'
import { ensureDataviewIndex } from '@dataview/engine/active/index/runtime'
import { createDataviewActivePlan } from '@dataview/engine/active/plan'
import { runDataviewActive, createDataviewActiveState } from '@dataview/engine/active/runtime'
import { createDataviewProjection } from '@dataview/engine/projection'
import type { DataviewState } from '@dataview/engine/active/state'
import { writeNormalizedIndexDemandKey } from '@dataview/engine/active/index/demand'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

const optionTable = <T extends { id: string }>(
  options: readonly T[]
) => options.map((option) => ({ ...option }))

const createView = (input?: {
  wrap?: boolean
  search?: string
  calc?: Record<string, 'sum'>
}) => ({
  id: VIEW_ID,
  type: 'table' as const,
  name: 'Tasks',
  filter: {
    mode: 'and' as const,
    rules: []
  },
  search: {
    query: input?.search ?? ''
  },
  sort: {
    rules: []
  },
  group: {
    fieldId: FIELD_STATUS,
    showEmpty: true
  },
  calc: input?.calc ?? {
    [FIELD_POINTS]: 'sum' as const
  },
  fields: ['title', FIELD_STATUS, FIELD_POINTS],
  options: {
    widths: {},
    showVerticalLines: true,
    wrap: input?.wrap ?? false
  },
  order: []
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
        options: optionTable([
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
        ])
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
        options: optionTable([{
          id: 'todo',
          name: 'Todo',
          color: 'gray',
          category: 'todo'
        }])
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

const toDelta = (input: {
  reset?: true
  changes?: Record<string, unknown>
} = {}) => createMutationDelta(dataviewMutationModel, {
  ...(input.reset ? { reset: true } : {}),
  changes: input.changes ?? {}
})

const createState = (): DataviewState => ({
  revision: 0,
  active: createDataviewActiveState()
})

test('createDataviewFrame resolves plain active spec from document', () => {
  const frame = createDataviewFrame({
    revision: 1,
    document: createDocument(),
    delta: toDelta({
      changes: {
        'view.sort': {
          ids: [VIEW_ID],
          paths: {
            [VIEW_ID]: ['sort.rules']
          }
        }
      }
    })
  })

  assert.equal(frame.active?.id, VIEW_ID)
  assert.equal(typeof frame.active?.query.executionKey, 'string')
  assert.deepEqual(frame.active?.calcFields, [FIELD_POINTS])
})

test('ensureDataviewIndex keeps one active index and syncs active demand changes', () => {
  const firstFrame = createDataviewFrame({
    revision: 1,
    document: createDocument(createView({
      search: ''
    })),
    delta: toDelta({
      reset: true
    })
  })
  const first = ensureDataviewIndex({
    frame: firstFrame,
    previous: undefined
  })
  assert.equal(first?.action, 'rebuild')

  const secondFrame = createDataviewFrame({
    revision: 2,
    document: createDocument(createView({
      calc: {}
    })),
    delta: toDelta({
      changes: {
        'view.calc': {
          ids: [VIEW_ID]
        }
      }
    })
  })
  const second = ensureDataviewIndex({
    frame: secondFrame,
    previous: first?.index
  })
  assert.equal(second?.action, 'sync')
  assert.equal(
    writeNormalizedIndexDemandKey(second!.index.demand) === writeNormalizedIndexDemandKey(first!.index.demand),
    false
  )
  assert.deepEqual(second?.index.delta?.demand?.calculations.removed.map(entry => entry.fieldId), [FIELD_POINTS])
  assert.equal(second?.index.trace?.summaries.action, 'sync')
})

test('createDataviewActivePlan keeps layout-only change inside publish', () => {
  const previousFrame = createDataviewFrame({
    revision: 1,
    document: createDocument(),
    delta: toDelta({
      reset: true
    })
  })
  const previousIndex = ensureDataviewIndex({
    frame: previousFrame,
    previous: undefined
  })
  const previousState = createState()
  previousState.active = runDataviewActive({
    frame: previousFrame,
    plan: createDataviewActivePlan({
      frame: previousFrame,
      previous: previousState.active,
      index: previousIndex
    }),
    index: previousIndex,
    previous: previousState.active
  })

  const nextFrame = createDataviewFrame({
    revision: 2,
    document: createDocument(createView({
      wrap: true
    })),
    delta: toDelta({
      changes: {
        'view.options': {
          ids: [VIEW_ID],
          paths: {
            [VIEW_ID]: ['options.wrap']
          }
        }
      }
    })
  })
  const ensured = ensureDataviewIndex({
    frame: nextFrame,
    previous: previousState.active.index
  })
  const plan = createDataviewActivePlan({
    frame: nextFrame,
    previous: previousState.active,
    index: ensured
  })

  assert.equal(plan.query.action, 'reuse')
  assert.equal(plan.membership.action, 'reuse')
  assert.equal(plan.summary.action, 'reuse')
  assert.equal(plan.publish.action, 'sync')
})

test('runDataviewActive derives grouped sections and summaries in one active pipeline', () => {
  const frame = createDataviewFrame({
    revision: 1,
    document: createDocument(),
    delta: toDelta({
      reset: true
    })
  })
  const state = createState()
  const ensured = ensureDataviewIndex({
    frame,
    previous: state.active.index
  })
  const plan = createDataviewActivePlan({
    frame,
    previous: state.active,
    index: ensured
  })
  const active = runDataviewActive({
    frame,
    plan,
    index: ensured,
    previous: state.active
  })

  assert.deepEqual(active.snapshot?.sections.ids, ['todo', 'doing', '(empty)'])
  assert.deepEqual(active.snapshot?.items.ids, [1, 2])
  assert.equal(active.snapshot?.summaries.has('todo'), true)
  assert.equal(active.trace.query.action, 'rebuild')
  assert.equal(active.trace.membership.action, 'rebuild')
  assert.equal(active.trace.summary.action, 'rebuild')
  assert.equal(active.trace.publish.action, 'rebuild')
})

test('createDataviewProjection now runs active only and clears snapshot when active view disappears', () => {
  const runtime = createDataviewProjection()
  const first = runtime.update({
    document: createDocument(),
    delta: toDelta({
      reset: true
    })
  })

  assert.deepEqual(
    first.trace.phases.map((phase) => phase.name),
    ['active']
  )
  assert.equal(first.capture.activeId, VIEW_ID)
  assert.equal(first.capture.active?.sections.count, 3)

  const cleared = runtime.update({
    document: createEmptyDocument(),
    delta: toDelta({
      changes: {
        'document.activeViewId': true
      }
    })
  })

  assert.deepEqual(
    cleared.trace.phases.map((phase) => phase.name),
    ['active']
  )
  assert.equal(cleared.capture.activeId, undefined)
  assert.equal(cleared.capture.active, undefined)
})
