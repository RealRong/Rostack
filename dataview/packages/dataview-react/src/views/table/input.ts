import type { KeyInput } from '@dataview/react/interaction'
import type { FieldId } from '@dataview/core/contracts'
import type { ViewState as CurrentView } from '@dataview/engine'
import {
  type CellRef
} from '@dataview/engine'
import type {
  Engine
} from '@dataview/engine'
import {
  selection as rowSelection
} from '@dataview/react/runtime/selection'
import {
  gridKeyAction,
  isSelectAll,
  parseClipboardMatrix,
  planPaste,
  gridSelection,
  type TableKeyInput
} from '@dataview/table'
import type { CellOpenInput } from '@dataview/react/views/table/openCell'
import type { TableSelectionRuntime } from '@dataview/react/views/table/selectionRuntime'

const currentKey = (
  input: TableKeyInput | KeyInput
): TableKeyInput => 'type' in input
    ? {
      key: input.key,
      modifiers: input.modifiers
    }
    : input

export const handleTableKey = (input: {
  key: TableKeyInput | KeyInput
  editor: Engine
  currentView: CurrentView
  selection: TableSelectionRuntime
  locked: boolean
  readCell: (cell: CellRef) => {
    exists: boolean
  }
  openCell: (input: CellOpenInput) => boolean
  reveal: () => void
  setKeyboardMode: () => void
}) => {
  if (input.locked) {
    return false
  }

  const key = currentKey(input.key)
  if (isSelectAll(key)) {
    input.selection.rows.all()
    input.setKeyboardMode()
    input.reveal()
    return true
  }

  const mode = input.selection.mode.get()
  const currentGridSelection = input.selection.cells.get()
  if (mode === 'cells' && currentGridSelection) {
    if (key.key === 'Escape') {
      const rowIds = gridSelection.itemIds(
        currentGridSelection,
        input.currentView.items
      )
      input.selection.rows.set(rowIds, {
        anchor: rowIds[0],
        focus: rowIds[rowIds.length - 1]
      })
      input.setKeyboardMode()
      input.reveal()
      return true
    }

    const action = gridKeyAction({
      key,
      selection: currentGridSelection,
      items: input.currentView.items,
      fields: input.currentView.fields,
      read: {
        cell: input.readCell,
        field: (fieldId: FieldId) => input.currentView.fields.get(fieldId)
      }
    })
    if (!action) {
      return false
    }

    input.setKeyboardMode()

    switch (action.kind) {
      case 'move-cell':
        input.selection.cells.move(action.rowDelta, action.columnDelta, {
          extend: action.extend,
          wrap: action.wrap
        })
        input.reveal()
        return true
      case 'open-cell':
        input.openCell({
          cell: action.cell,
          seedDraft: action.seedDraft
        })
        return true
      case 'clear-cells': {
        action.itemIds.forEach(itemId => {
          action.fieldIds.forEach(fieldId => {
            input.editor.active.cells.clear({
              itemId,
              fieldId
            })
          })
        })
        input.reveal()
        return true
      }
    }
  }

  const currentSelection = input.selection.rows.get()
  if (mode !== 'rows' || !currentSelection.ids.length) {
    return false
  }

  switch (key.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      const next = rowSelection.step(
        input.currentView.items.ids,
        currentSelection,
        key.key === 'ArrowUp' ? -1 : 1,
        {
          extend: key.modifiers.shiftKey
        }
      )
      if (!next) {
        return false
      }

      input.selection.rows.set(next.ids, {
        anchor: next.anchor,
        focus: next.focus
      })
      input.setKeyboardMode()
      input.reveal()
      return true
    }
    case 'ArrowRight':
    case 'Enter': {
      const rowId = currentSelection.focus ?? currentSelection.ids[0]
      if (!rowId) {
        return false
      }

      input.selection.cells.first(rowId)
      input.setKeyboardMode()
      input.reveal()
      return true
    }
    case 'Backspace':
    case 'Delete':
      input.editor.active.items.remove(
        currentSelection.ids
      )
      input.setKeyboardMode()
      input.reveal()
      return true
    default:
      return false
  }
}

export const applyPaste = (input: {
  editor: Engine
  currentView: CurrentView | undefined
  gridSelection: ReturnType<TableSelectionRuntime['cells']['get']>
  text: string
}) => {
  if (!input.currentView) {
    return false
  }
  const currentView = input.currentView

  const matrix = parseClipboardMatrix(input.text)
  if (!matrix.length) {
    return false
  }

  const entries = planPaste({
    selection: input.gridSelection,
    items: currentView.items,
    fields: currentView.fields,
    matrix
  })
  if (!entries.length) {
    return false
  }

  entries.forEach(entry => {
    if (entry.value === undefined) {
      input.editor.active.cells.clear(entry.cell)
      return
    }

    input.editor.active.cells.set(entry.cell, entry.value)
  })

  return true
}
