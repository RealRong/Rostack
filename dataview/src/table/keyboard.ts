import type { GroupProperty, PropertyId } from '@dataview/core/contracts'
import { resolvePropertyValueBehavior } from '@dataview/core/property'
import type {
  AppearanceId,
  AppearanceList,
  FieldId,
  PropertyList
} from '@dataview/engine/projection/view'
import type { GridSelection } from './gridSelection'
import { range } from './range'

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
  cell: (cell: FieldId) => {
    exists: boolean
  }
  property: (propertyId: PropertyId) => GroupProperty | undefined
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
      cell: FieldId
      seedDraft?: string
    }
  | {
      kind: 'clear-cells'
      appearanceIds: readonly AppearanceId[]
      propertyIds: readonly PropertyId[]
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
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>
  properties: Pick<PropertyList, 'indexOf' | 'ids'>
  read: TableKeyboardRead
}): TableGridKeyAction | null => {
  const behavior = resolvePropertyValueBehavior({
    exists: input.read.cell(input.selection.focus).exists,
    property: input.read.property(input.selection.focus.propertyId)
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
        appearanceIds: currentRange ? range.appearances(currentRange, input.appearances) : [],
        propertyIds: currentRange ? range.properties(currentRange, input.properties) : []
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
