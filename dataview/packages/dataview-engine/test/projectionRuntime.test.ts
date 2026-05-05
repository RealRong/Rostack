import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import {
  createMutationChange,
  createMutationWriter,
} from '@shared/mutation'
import {
  createDataviewChange,
  createDataviewQuery,
  dataviewMutationSchema,
  type DataviewMutationWriter
} from '@dataview/core/mutation'
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
) => entityTable.normalize.list(
  options.map((option) => ({ ...option }))
)

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

const createChange = (
  document: ReturnType<typeof createDocument>,
  input: {
  reset?: true
  write?: (writer: DataviewMutationWriter) => void
} = {}
) => {
  const writes = []
  if (input.write) {
    const writer = createMutationWriter(dataviewMutationSchema, writes)
    input.write(writer)
  }

  return createDataviewChange(
    createDataviewQuery(document),
    createMutationChange(dataviewMutationSchema, writes, input.reset
      ? {
          reset: true
        }
      : undefined)
  )
}

const createFrame = (input: {
  revision: number
  document: ReturnType<typeof createDocument>
  change?: {
    reset?: true
    write?: (writer: DataviewMutationWriter) => void
  }
}) => createDataviewFrame({
  revision: input.revision,
  document: input.document,
  change: createChange(input.document, input.change)
})

const createState = (): DataviewState => ({
  revision: 0,
  active: createDataviewActiveState()
})

test('createDataviewFrame resolves plain active spec from document', () => {
  const frame = createFrame({
    revision: 1,
    document: createDocument(),
    change: {
      write: (write) => {
        write.views(VIEW_ID).patch({
          sort: createView().sort
        })
      }
    }
  })

  assert.equal(frame.active?.id, VIEW_ID)
  assert.equal(typeof frame.active?.query.executionKey, 'string')
  assert.deepEqual(frame.active?.calcFields, [FIELD_POINTS])
})

test('ensureDataviewIndex keeps one active index and syncs active demand changes', () => {
  const firstFrame = createFrame({
    revision: 1,
    document: createDocument(createView({
      search: ''
    })),
    change: {
      reset: true
    }
  })
  const first = ensureDataviewIndex({
    frame: firstFrame,
    previous: undefined
  })
  assert.equal(first?.action, 'rebuild')

  const secondFrame = createFrame({
    revision: 2,
    document: createDocument(createView({
      calc: {}
    })),
    change: {
      write: (write) => {
        write.views(VIEW_ID).patch({
          calc: {}
        })
      }
    }
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
})

test('createDataviewActivePlan keeps layout-only change inside publish', () => {
  const previousFrame = createFrame({
    revision: 1,
    document: createDocument(),
    change: {
      reset: true
    }
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

  const nextFrame = createFrame({
    revision: 2,
    document: createDocument(createView({
      wrap: true
    })),
    change: {
      write: (write) => {
        write.views(VIEW_ID).patch({
          options: createView({
            wrap: true
          }).options
        })
      }
    }
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
  const frame = createFrame({
    revision: 1,
    document: createDocument(),
    change: {
      reset: true
    }
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
})

test('createDataviewProjection now runs active only and clears snapshot when active view disappears', () => {
  const runtime = createDataviewProjection()
  const first = runtime.update({
    document: createDocument(),
    change: createChange(createDocument(), {
      reset: true
    })
  })

  assert.deepEqual(
    first.trace.phases.map((phase) => phase.name),
    ['document', 'active']
  )
  assert.equal(first.capture.activeId, VIEW_ID)
  assert.equal(first.capture.active?.sections.count, 3)

  const cleared = runtime.update({
    document: createEmptyDocument(),
    change: createChange(createEmptyDocument(), {
      write: (write) => {
        write.activeViewId.set(undefined)
      }
    })
  })

  assert.deepEqual(
    cleared.trace.phases.map((phase) => phase.name),
    ['document', 'active']
  )
  assert.equal(cleared.capture.activeId, undefined)
  assert.equal(cleared.capture.active, undefined)
})
