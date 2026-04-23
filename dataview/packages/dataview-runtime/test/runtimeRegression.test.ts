import { describe, expect, test } from 'vitest'
import {
  TITLE_FIELD_ID,
  type Field
} from '@dataview/core/contracts'
import { view } from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import {
  createDataViewRuntime
} from '@dataview/runtime'
import {
  createItemArraySelectionScope
} from '@dataview/runtime'
import { entityTable } from '@shared/core'

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
  },
  {
    id: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
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

const createFieldTable = (fields: readonly Field[]) => entityTable.normalize.list(fields)

const createEmptyFilter = () => ({
  mode: 'and' as const,
  rules: entityTable.normalize.list([])
})

const createEmptySort = () => ({
  rules: entityTable.normalize.list([])
})

const addOptionFilter = (
  engine: ReturnType<typeof createEngine>,
  fieldId: string,
  optionIds: readonly string[]
) => {
  const id = engine.active.filters.create(fieldId)
  engine.active.filters.patch(id, {
    presetId: 'eq',
    value: {
      kind: 'option-set',
      optionIds: [...optionIds]
    }
  })
  return id
}

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
    filter: createEmptyFilter(),
    search: {
      query: ''
    },
    sort: createEmptySort(),
    calc: {},
    display: {
      fields: [TITLE_FIELD_ID, FIELD_STATUS]
    },
    options: {
      ...view.options.defaults(input.type, fields)
    },
    orders: [],
    ...(input.type === 'kanban'
      ? {
          group: {
            fieldId: FIELD_STATUS,
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
        },
        rec_2: {
          id: 'rec_2',
          title: 'Task 2',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'doing'
          }
        },
        rec_3: {
          id: 'rec_3',
          title: 'Task 3',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'done'
          }
        }
      },
      order: ['rec_1', 'rec_2', 'rec_3']
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

    const itemId = engine.active.state()?.items.ids[0]
    expect(runtime.model.page.toolbar.get().view?.id).toBe(VIEW_BOARD)
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
    const itemIds = engine.active.state()?.items.ids ?? []
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

  test('kanban cards stay readable after grouped filters are added and removed', () => {
    const engine = createEngine({
      document: createDocument()
    })
    const runtime = createDataViewRuntime({
      engine
    })

    engine.views.open(VIEW_BOARD)

    const readVisibleItemIds = () => runtime.source.active.sections.ids.get().flatMap(sectionId => (
      runtime.source.active.sections.get(sectionId)?.itemIds ?? []
    ))
    const assertReadableCards = (expectedRecordIds: readonly string[]) => {
      const visibleItemIds = readVisibleItemIds()

      expect(visibleItemIds.map(itemId => runtime.model.kanban.card.get(itemId)?.recordId)).toEqual(expectedRecordIds)
      visibleItemIds.forEach(itemId => {
        expect(runtime.model.kanban.card.get(itemId)).toBeDefined()
        expect(runtime.model.kanban.content.get(itemId)).toBeDefined()
      })
    }

    assertReadableCards(['rec_1', 'rec_2', 'rec_3'])

    const filterId = addOptionFilter(engine, FIELD_STATUS, ['done'])

    assertReadableCards(['rec_3'])

    engine.active.filters.remove(filterId)

    assertReadableCards(['rec_1', 'rec_2', 'rec_3'])

    runtime.dispose()
  })

  test('table summaries stay empty when grouped filters leave every section empty', () => {
    const engine = createEngine({
      document: createDocument()
    })
    const runtime = createDataViewRuntime({
      engine
    })

    engine.active.summary.set(FIELD_STATUS, 'countByOption')
    engine.active.group.set(FIELD_STATUS)
    addOptionFilter(engine, FIELD_STATUS, ['blocked'])

    expect(runtime.model.table.summary.get('todo')?.byField.get(FIELD_STATUS)?.kind).toBe('empty')
    expect(runtime.model.table.summary.get('doing')?.byField.get(FIELD_STATUS)?.kind).toBe('empty')
    expect(runtime.model.table.summary.get('done')?.byField.get(FIELD_STATUS)?.kind).toBe('empty')

    runtime.dispose()
  })

  test('document value source stays synced for title, field writes, clears, and record removal', () => {
    const engine = createEngine({
      document: createDocument()
    })
    const runtime = createDataViewRuntime({
      engine
    })

    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: TITLE_FIELD_ID
    })).toBe('Task 1')
    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    })).toBe('todo')

    engine.records.fields.set('rec_1', TITLE_FIELD_ID, 'Task 1 updated')
    engine.records.fields.set('rec_1', FIELD_STATUS, 'done')

    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: TITLE_FIELD_ID
    })).toBe('Task 1 updated')
    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    })).toBe('done')

    engine.records.fields.clear('rec_1', FIELD_STATUS)

    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    })).toBeUndefined()

    engine.records.remove('rec_1')

    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: TITLE_FIELD_ID
    })).toBeUndefined()
    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    })).toBeUndefined()

    runtime.dispose()
  })

  test('document value source clears removed field values across records', () => {
    const engine = createEngine({
      document: createDocument()
    })
    const runtime = createDataViewRuntime({
      engine
    })

    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    })).toBe('todo')
    expect(runtime.source.document.values.get({
      recordId: 'rec_2',
      fieldId: FIELD_STATUS
    })).toBe('doing')

    engine.fields.remove(FIELD_STATUS)

    expect(runtime.source.document.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    })).toBeUndefined()
    expect(runtime.source.document.values.get({
      recordId: 'rec_2',
      fieldId: FIELD_STATUS
    })).toBeUndefined()
    expect(runtime.source.document.values.get({
      recordId: 'rec_3',
      fieldId: FIELD_STATUS
    })).toBeUndefined()
    expect(runtime.source.document.values.get({
      recordId: 'rec_2',
      fieldId: TITLE_FIELD_ID
    })).toBe('Task 2')

    runtime.dispose()
  })
})
