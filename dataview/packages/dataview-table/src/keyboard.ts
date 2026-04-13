import type { Field, FieldId } from '@dataview/core/contracts'
import { resolveFieldValueBehavior } from '@dataview/core/field'
import type {
  ItemId,
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import type { GridSelection } from '#table/gridSelection.ts'
import { range } from '#table/range.ts'

export interface TableKeyInput {
  key: string
  modifiers: {
    shiftKey: boolean
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
  }
}

export interface TableKeyboardRead {
  cell: (cell: CellRef) => {
    exists: boolean
  }
  field: (fieldId: FieldId) => Field | undefined
}

export type TableGridKeyAction =
  | {
      kind: 'move-cell'
      rowDelta: number
      columnDelta: number
      extend?: boolean
      wrap?: boolean
    }
  | {
      kind: 'open-cell'
      cell: CellRef
      seedDraft?: string
    }
  | {
      kind: 'clear-cells'
      itemIds: readonly ItemId[]
      fieldIds: readonly FieldId[]
    }

const isPrintableKey = (input: TableKeyInput) => (
  input.key.length === 1
  && !input.modifiers.metaKey
  && !input.modifiers.ctrlKey
  && !input.modifiers.altKey
)

export const isSelectAll = (input: TableKeyInput) => (
  (input.modifiers.ctrlKey || input.modifiers.metaKey)
  && !input.modifiers.altKey
  && input.key.toLowerCase() === 'a'
)

export const gridKeyAction = (input: {
  key: TableKeyInput
  selection: GridSelection
  items: Pick<ItemList, 'indexOf' | 'ids'>
  fields: Pick<FieldList, 'indexOf' | 'ids'>
  read: TableKeyboardRead
}): TableGridKeyAction | null => {
  const behavior = resolveFieldValueBehavior({
    exists: input.read.cell(input.selection.focus).exists,
    field: input.read.field(input.selection.focus.fieldId)
  })
  const canEdit = behavior.canEdit

  switch (input.key.key) {
    case 'ArrowUp':
      return {
        kind: 'move-cell',
        rowDelta: -1,
        columnDelta: 0,
        extend: input.key.modifiers.shiftKey
      }
    case 'ArrowDown':
      return {
        kind: 'move-cell',
        rowDelta: 1,
        columnDelta: 0,
        extend: input.key.modifiers.shiftKey
      }
    case 'ArrowLeft':
      return {
        kind: 'move-cell',
        rowDelta: 0,
        columnDelta: -1,
        extend: input.key.modifiers.shiftKey
      }
    case 'ArrowRight':
      return {
        kind: 'move-cell',
        rowDelta: 0,
        columnDelta: 1,
        extend: input.key.modifiers.shiftKey
      }
    case 'Tab':
      return {
        kind: 'move-cell',
        rowDelta: 0,
        columnDelta: input.key.modifiers.shiftKey ? -1 : 1,
        wrap: true
      }
    case 'Enter':
    case 'F2':
      return canEdit
        ? {
            kind: 'open-cell',
            cell: input.selection.focus
          }
        : null
    case 'Backspace':
    case 'Delete': {
      const currentRange = range.from(input.selection)
      return {
        kind: 'clear-cells',
        itemIds: currentRange ? range.items(currentRange, input.items) : [],
        fieldIds: currentRange ? range.fields(currentRange, input.fields) : []
      }
    }
    default:
      return isPrintableKey(input.key) && canEdit
        ? {
            kind: 'open-cell',
            cell: input.selection.focus,
            seedDraft: input.key.key
          }
        : null
  }
}
