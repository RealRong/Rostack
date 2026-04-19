import { describe, expect, test } from 'vitest'
import {
  TITLE_FIELD_ID,
  type Field
} from '@dataview/core/contracts'
import { createDefaultViewOptions } from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import {
  createDataViewRuntime,
  createItemArraySelectionScope
} from '@dataview/runtime'

const FIELD_STATUS = 'status'
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
    name: 'Doing',
    color: 'blue',
    category: 'in_progress'
  }
] as const

const createFields = (): readonly Field[] => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'status',
    defaultOptionId: 'todo',
    options: STATUS_OPTIONS.map(option => ({ ...option }))
  }
])

const createFieldTable = (fields: readonly Field[]) => ({
  byId: Object.fromEntries(fields.map(field => [field.id, field])),
  order: fields.map(field => field.id)
})

const createView = (input: {
  id: string
  name: string
  type: 'table' | 'kanban'
}) => {
  const fields = createFields()

  return {
    id: input.id,
    type: input.type,
    name: input.name,
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
      fields: [TITLE_FIELD_ID, FIELD_STATUS]
    },
    options: {
      ...createDefaultViewOptions(input.type, fields)
    },
    orders: [],
    ...(input.type === 'kanban'
      ? {
          group: {
            field: FIELD_STATUS,
            mode: 'option',
            bucketSort: 'manual',
            showEmpty: true
          }
        }
      : {})
  }
}

const createDocument = () => {
  const fields = createFields()

  return {
    schemaVersion: 1,
    activeViewId: VIEW_TABLE,
    fields: createFieldTable(fields),
    views: {
      byId: {
        [VIEW_TABLE]: createView({
          id: VIEW_TABLE,
          name: 'Table',
          type: 'table'
        }),
        [VIEW_BOARD]: createView({
          id: VIEW_BOARD,
          name: 'Board',
          type: 'kanban'
        })
      },
      order: [VIEW_TABLE, VIEW_BOARD]
    },
    records: {
      byId: {
        rec_1: {
          id: 'rec_1',
          title: 'Task 1',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'todo'
          }
        }
      },
      order: ['rec_1']
    },
    meta: {}
  }
}

describe('data view runtime regressions', () => {
  test('opening a kanban view does not trip derived store cycles', () => {
    const engine = createEngine({
      document: createDocument()
    })
    const runtime = createDataViewRuntime({
      engine
    })

    const unsubscribeToolbar = runtime.model.page.toolbar.subscribe(() => {})
    const unsubscribeBody = runtime.model.page.body.subscribe(() => {})
    const unsubscribeBoard = runtime.model.kanban.board.subscribe(() => {})

    expect(() => {
      engine.views.open(VIEW_BOARD)
    }).not.toThrow()

    const itemId = engine.active.state.get()?.items.ids[0]
    expect(runtime.model.page.toolbar.get().currentView?.id).toBe(VIEW_BOARD)
    expect(runtime.model.kanban.board.get()?.viewId).toBe(VIEW_BOARD)
    expect(itemId).toBeDefined()
    expect(() => runtime.model.kanban.card.get(itemId!)).not.toThrow()
    expect(() => runtime.model.kanban.content.get(itemId!)).not.toThrow()

    unsubscribeBoard()
    unsubscribeBody()
    unsubscribeToolbar()
    runtime.dispose()
  })

  test('starting marquee with preview scope subscribers does not call store.get inside derived computation', () => {
    const engine = createEngine({
      document: createDocument()
    })
    const runtime = createDataViewRuntime({
      engine
    })
    const itemIds = engine.active.state.get()?.items.ids ?? []
    const scope = createItemArraySelectionScope({
      key: 'all-items',
      ids: itemIds
    })
    const unsubscribePreview = runtime.session.marquee.preview.scopeSummary.subscribe(
      scope,
      () => {}
    )

    expect(() => {
      runtime.session.marquee.start({
        mode: 'replace',
        start: {
          x: 0,
          y: 0
        },
        baseSelection: runtime.session.selection.state.getSnapshot()
      })
    }).not.toThrow()

    unsubscribePreview()
    runtime.dispose()
  })
})
