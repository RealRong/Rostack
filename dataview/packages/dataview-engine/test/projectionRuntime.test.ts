import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import { createDataviewMutationDelta } from '@dataview/engine/mutation/delta'
import { createDataviewFrame } from '@dataview/engine/active/frame'
import { ensureDataviewIndex } from '@dataview/engine/active/index/runtime'
import { createDataviewActivePlan } from '@dataview/engine/active/plan'
import { runDataviewActive, createDataviewActiveState } from '@dataview/engine/active/runtime'
import { createDataviewProjection } from '@dataview/engine/projection'
import type { DataviewState } from '@dataview/engine/active/state'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

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
    rules: entityTable.normalize.list([])
  },
  search: {
    query: input?.search ?? ''
  },
  sort: {
    rules: entityTable.normalize.list([])
  },
  group: {
    fieldId: FIELD_STATUS,
    showEmpty: true
  },
  calc: input?.calc ?? {
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

const toDelta = (input: {
  reset?: true
  changes?: Record<string, unknown>
} = {}) => createDataviewMutationDelta({
  ...(input.reset ? { reset: true } : {}),
  changes: input.changes ?? {}
})

const createState = (): DataviewState => ({
  index: {
    entries: new Map()
  },
  active: createDataviewActiveState()
})

test('createDataviewFrame binds active query/calc reads on top of MutationDelta', () => {
  const frame = createDataviewFrame({
    revision: 1,
    document: createDocument(),
    delta: toDelta({
      changes: {
        'view.query': {
          ids: [VIEW_ID],
          paths: {
            [VIEW_ID]: ['sort']
          }
        },
        'view.calc': {
          ids: [VIEW_ID]
        }
      }
    })
  })

  assert.equal(frame.active?.id, VIEW_ID)
  assert.equal(frame.active?.query.changed('sort'), true)
  assert.equal(frame.active?.query.changed('group'), false)
  assert.equal(frame.active?.calc.changed(), true)
})

test('ensureDataviewIndex uses demand-keyed bank and can switch current entry', () => {
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
    previous: {
      entries: new Map()
    }
  })
  assert.equal(first.current?.action, 'rebuild')

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
    previous: first.bank
  })
  assert.equal(second.current?.entry.key === first.current?.entry.key, false)
  assert.equal(second.bank.currentKey, second.current?.entry.key)

  const back = ensureDataviewIndex({
    frame: firstFrame,
    previous: second.bank
  })
  assert.equal(back.current?.action, 'switch')
  assert.equal(back.bank.currentKey, first.current?.entry.key)
})

test('createDataviewActivePlan exposes reasons and keeps layout-only change inside publish', () => {
  const previousFrame = createDataviewFrame({
    revision: 1,
    document: createDocument(),
    delta: toDelta({
      reset: true
    })
  })
  const previousIndex = ensureDataviewIndex({
    frame: previousFrame,
    previous: {
      entries: new Map()
    }
  })
  const previousState = createState()
  previousState.index = previousIndex.bank
  previousState.active = runDataviewActive({
    frame: previousFrame,
    plan: createDataviewActivePlan({
      frame: previousFrame,
      state: previousState,
      index: previousIndex.current
    }),
    index: previousIndex.current,
    previous: previousState.active
  })

  const nextFrame = createDataviewFrame({
    revision: 2,
    document: createDocument(createView({
      wrap: true
    })),
    delta: toDelta({
      changes: {
        'view.layout': [VIEW_ID]
      }
    })
  })
  previousState.lastActive = {
    id: VIEW_ID,
    queryKey: previousFrame.active!.query.plan.executionKey,
    section: previousFrame.active!.section,
    calcFields: previousFrame.active!.calc.fields
  }
  const ensured = ensureDataviewIndex({
    frame: nextFrame,
    previous: previousIndex.bank
  })
  const plan = createDataviewActivePlan({
    frame: nextFrame,
    state: previousState,
    index: ensured.current
  })

  assert.equal(plan.reasons.publish.layoutChanged, true)
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
    previous: state.index
  })
  const plan = createDataviewActivePlan({
    frame,
    state,
    index: ensured.current
  })
  const active = runDataviewActive({
    frame,
    plan,
    index: ensured.current,
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

test('createDataviewProjection now runs frame -> active and clears snapshot when active view disappears', () => {
  const runtime = createDataviewProjection()
  const first = runtime.update({
    document: createDocument(),
    delta: toDelta({
      reset: true
    })
  })

  assert.deepEqual(
    first.trace.phases.map((phase) => phase.name),
    ['frame', 'active']
  )
  assert.equal(first.output.activeId, VIEW_ID)
  assert.equal(first.output.active?.sections.count, 3)

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
    ['frame', 'active']
  )
  assert.equal(cleared.output.activeId, undefined)
  assert.equal(cleared.output.active, undefined)
})
