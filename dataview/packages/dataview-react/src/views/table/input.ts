import type { KeyInput } from '@dataview/react/interaction'
import {
  type CellRef,
  type ItemList
} from '@dataview/engine'
import type {
  Engine
} from '@dataview/engine'
import type {
  TableDisplayedFields
} from '@dataview/react/views/table/displayFields'
import {
  createItemListSelectionDomain,
  selectionSnapshot
} from '@dataview/runtime'
import { store } from '@shared/core'
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
  items: ItemList
  fields: TableDisplayedFields
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
    input.selection.rows.command.selectAll()
    input.setKeyboardMode()
    return true
  }

  const mode = store.peek(input.selection.mode)
  const currentGridSelection = store.peek(input.selection.cells.store)
  if (mode === 'cells' && currentGridSelection) {
    if (key.key === 'Escape') {
      const rowIds = gridSelection.itemIds(
        currentGridSelection,
        input.items
      )
      if (!rowIds.length) {
        return false
      }

      input.selection.rows.command.applyIds('replace', rowIds, {
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
      items: input.items,
      fields: input.fields,
      read: {
        cell: input.readCell,
        field: fieldId => input.fields.get(fieldId)
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

  const currentSelection = input.selection.rows.state.getSnapshot()
  if (mode !== 'rows' || !currentSelection.selectedCount) {
    return false
  }

  const rowDomain = createItemListSelectionDomain(input.items)

  switch (key.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!input.selection.rows.command.range.step(
        key.key === 'ArrowUp' ? -1 : 1,
        {
          extend: key.modifiers.shiftKey
        }
      )) {
        return false
      }

      input.setKeyboardMode()
      input.reveal()
      return true
    }
    case 'ArrowRight':
    case 'Enter': {
      const rowId = selectionSnapshot.primary(rowDomain, currentSelection)
      if (!rowId) {
        return false
      }

      input.selection.cells.first(rowId)
      input.setKeyboardMode()
      input.reveal()
      return true
    }
    case 'Backspace':
    case 'Delete': {
      const rowIds = input.selection.rows.enumerate.materialize()
      if (!rowIds.length) {
        return false
      }

      input.editor.active.items.remove(rowIds)
      input.setKeyboardMode()
      input.reveal()
      return true
    }
    default:
      return false
  }
}

export const applyPaste = (input: {
  editor: Engine
  items: ItemList
  fields: TableDisplayedFields
  gridSelection: ReturnType<TableSelectionRuntime['cells']['get']>
  text: string
}) => {
  const matrix = parseClipboardMatrix(input.text)
  if (!matrix.length) {
    return false
  }

  const entries = planPaste({
    selection: input.gridSelection,
    items: input.items,
    fields: input.fields,
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
