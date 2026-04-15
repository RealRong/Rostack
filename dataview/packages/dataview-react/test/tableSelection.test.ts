import assert from 'node:assert/strict'
import { expect, test, vi } from 'vitest'
import {
  createValueStore
} from '@shared/core'
import {
  createSelectionApi,
  createSelectionStore
} from '@dataview/react/runtime/selection'
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

const createSelectionRuntimeStub = (input: {
  mode: 'none' | 'rows' | 'cells'
  rowIds?: readonly string[]
  grid?: ReturnType<typeof gridSelection.set> | null
}) => {
  const rowIds = input.rowIds ?? []
  const grid = input.grid ?? null

  return {
    mode: {
      get: () => input.mode,
      subscribe: () => () => {}
    },
    rows: {
      get: () => ({
        ids: rowIds,
        anchor: rowIds[0],
        focus: rowIds[rowIds.length - 1]
      }),
      clear: vi.fn(),
      all: vi.fn(),
      set: vi.fn(),
      toggle: vi.fn(),
      extend: vi.fn()
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
  const rowSelectionStore = createSelectionStore()
  const rowSelection = createSelectionApi({
    store: rowSelectionStore,
    scope: {
      items: () => ({
        ids: ['row_1', 'row_2'],
        has: id => id === 'row_1' || id === 'row_2'
      }) as never
    }
  })
  const currentViewStore = createValueStore({
    initial: undefined as never
  })
  const runtime = createTableSelectionRuntime({
    currentViewStore,
    rowSelection,
    rowSelectionStore
  })

  runtime.rows.set(['row_1'])
  assert.equal(runtime.mode.get(), 'rows')
  assert.deepEqual(runtime.rows.get().ids, ['row_1'])
  assert.equal(runtime.cells.get(), null)

  runtime.cells.set({
    itemId: 'row_2',
    fieldId: 'field_1'
  })
  assert.equal(runtime.mode.get(), 'cells')
  assert.deepEqual(runtime.rows.get().ids, [])
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

  runtime.rows.toggle(['row_1'])
  assert.equal(runtime.mode.get(), 'rows')
  assert.deepEqual(runtime.rows.get().ids, ['row_1'])
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
    currentView: {} as never,
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
    currentView: {
      items: {
        ids: ['row_1'],
        indexOf: () => 0
      },
      fields: {
        ids: ['field_1'],
        indexOf: () => 0,
        get: () => ({
          id: 'field_1',
          kind: 'text',
          name: 'Name'
        })
      }
    } as never,
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
