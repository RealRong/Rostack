import assert from 'node:assert/strict'
import { expect, test, vi } from 'vitest'
import { collection, store } from '@shared/core'
import {
  createItemArraySelectionDomain,
  createSelectionController,
  selectionSnapshot
} from '@dataview/runtime'
import {
  gridSelection
} from '@dataview/table'
import {
  handleTableKey
} from '@dataview/react/views/table/input'
import {
  createTableSelectionRuntime,
  type TableSelectionRuntime
} from '@dataview/react/views/table/selectionRuntime'

const createItemListStub = (ids: readonly string[]) => {
  const order = collection.createOrderedAccess(ids)
  return {
    ids,
    count: order.count,
    order,
    ...order,
    read: {
      recordId: () => undefined,
      sectionKey: () => undefined,
      placement: () => undefined
    }
  }
}

const createFieldListStub = (ids: readonly string[]) => ({
  ids,
  ...collection.createOrderedAccess(ids),
  get: (id: string) => id === 'field_1'
    ? {
        id: 'field_1',
        kind: 'text',
        name: 'Name'
      }
    : undefined
})

const createGridStub = (input: {
  itemIds: readonly string[]
  fieldIds?: readonly string[]
}) => ({
  items: createItemListStub(input.itemIds),
  fields: createFieldListStub(input.fieldIds ?? ['field_1']),
  sections: collection.createOrderedKeyedCollection({
    ids: [],
    all: [],
    get: () => undefined
  })
})

const createSelectionRuntimeStub = (input: {
  mode: 'none' | 'rows' | 'cells'
  rowIds?: readonly string[]
  grid?: ReturnType<typeof gridSelection.set> | null
}) => {
  const rowIds = input.rowIds ?? []
  const grid = input.grid ?? null
  const domain = createItemArraySelectionDomain(rowIds)
  const selection = rowIds.length
    ? selectionSnapshot.replaceIds(
        domain,
        rowIds,
        0,
        {
          anchor: rowIds[0],
          focus: rowIds[rowIds.length - 1]
        }
      )
    : selectionSnapshot.empty<string>(0)

  return {
    mode: {
      get: () => input.mode,
      subscribe: () => () => {}
    },
    rows: {
      state: {
        store: {
          get: () => selection,
          subscribe: () => () => {}
        },
        getSnapshot: () => selection,
        subscribe: () => () => {}
      },
      command: {
        restore: vi.fn(),
        clear: vi.fn(),
        selectAll: vi.fn(),
        ids: {
          replace: vi.fn(),
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn()
        },
        scope: {
          replace: vi.fn(),
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn()
        },
        range: {
          extendTo: vi.fn(),
          step: vi.fn(() => false)
        }
      },
      query: {
        contains: (id: string) => rowIds.includes(id),
        count: () => selection.selectedCount,
        summary: () => (
          selection.selectedCount === 0
            ? 'none'
            : selection.selectedCount === rowIds.length
              ? 'all'
              : 'some'
        )
      },
      enumerate: {
        iterate: () => rowIds.values(),
        materialize: () => rowIds
      },
      store: {
        membership: null as never,
        scopeSummary: null as never
      }
    },
    cells: {
      get: () => grid,
      clear: vi.fn(),
      set: vi.fn(),
      move: vi.fn(),
      first: vi.fn(),
      store: null as never,
      dispose: vi.fn()
    },
    clear: vi.fn(),
    dispose: vi.fn()
  } satisfies TableSelectionRuntime
}

test('table selection runtime keeps row and cell selection mutually exclusive', () => {
  const {
    controller: rowSelection
  } = createSelectionController<string>({
    domainSource: {
      get: () => createItemArraySelectionDomain(['row_1', 'row_2']),
      subscribe: () => () => {}
    }
  })
  const gridStore = store.createValueStore({
    initial: createGridStub({
      itemIds: ['row_1', 'row_2']
    })
  })
  const runtime = createTableSelectionRuntime({
    gridStore,
    rowSelection
  })

  runtime.rows.command.ids.replace(['row_1'], {
    anchor: 'row_1',
    focus: 'row_1'
  })
  assert.equal(runtime.mode.get(), 'rows')
  assert.deepEqual(runtime.rows.enumerate.materialize(), ['row_1'])
  assert.equal(runtime.cells.get(), null)

  runtime.cells.set({
    itemId: 'row_2',
    fieldId: 'field_1'
  })
  assert.equal(runtime.mode.get(), 'cells')
  assert.deepEqual(runtime.rows.enumerate.materialize(), [])
  assert.deepEqual(runtime.cells.get(), {
    anchor: {
      itemId: 'row_2',
      fieldId: 'field_1'
    },
    focus: {
      itemId: 'row_2',
      fieldId: 'field_1'
    }
  })

  runtime.rows.command.ids.toggle(['row_1'])
  assert.equal(runtime.mode.get(), 'rows')
  assert.deepEqual(runtime.rows.enumerate.materialize(), ['row_1'])
  assert.equal(runtime.cells.get(), null)
})

test('handleTableKey deletes selected rows in row mode', () => {
  const remove = vi.fn()
  const selection = createSelectionRuntimeStub({
    mode: 'rows',
    rowIds: ['row_1', 'row_2']
  })

  const handled = handleTableKey({
    key: {
      key: 'Delete',
      modifiers: {
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false
      }
    },
    editor: {
      active: {
        items: {
          remove
        }
      }
    } as never,
    grid: createGridStub({
      itemIds: ['row_1', 'row_2']
    }) as never,
    selection,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    openCell: vi.fn(() => false),
    reveal: vi.fn(),
    setKeyboardMode: vi.fn()
  })

  assert.equal(handled, true)
  expect(remove).toHaveBeenCalledWith(['row_1', 'row_2'])
})

test('handleTableKey does not reveal after select all in row mode', () => {
  const selection = createSelectionRuntimeStub({
    mode: 'rows',
    rowIds: ['row_1', 'row_2']
  })
  const reveal = vi.fn()
  const setKeyboardMode = vi.fn()

  const handled = handleTableKey({
    key: {
      key: 'a',
      modifiers: {
        shiftKey: false,
        metaKey: true,
        ctrlKey: false,
        altKey: false
      }
    },
    editor: {
      active: {
        items: {
          remove: vi.fn()
        }
      }
    } as never,
    grid: createGridStub({
      itemIds: ['row_1', 'row_2']
    }) as never,
    selection,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    openCell: vi.fn(() => false),
    reveal,
    setKeyboardMode
  })

  assert.equal(handled, true)
  expect(selection.rows.command.selectAll).toHaveBeenCalledOnce()
  expect(setKeyboardMode).toHaveBeenCalledOnce()
  expect(reveal).not.toHaveBeenCalled()
})

test('handleTableKey keeps delete-as-clear for active cell selection in cell mode', () => {
  const remove = vi.fn()
  const clearCell = vi.fn()
  const selection = createSelectionRuntimeStub({
    mode: 'cells',
    grid: gridSelection.set({
      itemId: 'row_1',
      fieldId: 'field_1'
    })
  })

  const handled = handleTableKey({
    key: {
      key: 'Delete',
      modifiers: {
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false
      }
    },
    editor: {
      active: {
        items: {
          remove
        },
        cells: {
          clear: clearCell
        }
      }
    } as never,
    grid: createGridStub({
      itemIds: ['row_1'],
      fieldIds: ['field_1']
    }) as never,
    selection,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    openCell: vi.fn(() => false),
    reveal: vi.fn(),
    setKeyboardMode: vi.fn()
  })

  assert.equal(handled, true)
  expect(remove).not.toHaveBeenCalled()
  expect(clearCell).toHaveBeenCalledWith({
    itemId: 'row_1',
    fieldId: 'field_1'
  })
})
