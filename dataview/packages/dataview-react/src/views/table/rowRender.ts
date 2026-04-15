import type { FieldId } from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { CellRef, ItemId, ViewState as CurrentView } from '@dataview/engine'
import { fill, gridSelection, type GridSelection } from '@dataview/table'
import type { Capabilities } from '@dataview/react/views/table/capabilities'
import type { TableHoverTarget } from '@dataview/react/views/table/model/hover'

export interface RowRenderState {
  selectionVisible: boolean
  selectedFieldStart?: number
  selectedFieldEnd?: number
  focusFieldId?: FieldId
  hoverFieldId?: FieldId
  fillFieldId?: FieldId
}

interface SelectionChrome {
  rangeEdges?: {
    rowStart: number
    rowEnd: number
    fieldStart: number
    fieldEnd: number
  }
  focusCell?: CellRef
  selectionVisible: boolean
}

const equalCell = (
  left: CellRef | undefined,
  right: CellRef | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return left.itemId === right.itemId
    && left.fieldId === right.fieldId
}

const equalSelectionChrome = (
  left: SelectionChrome,
  right: SelectionChrome
) => (
  left.rangeEdges?.rowStart === right.rangeEdges?.rowStart
  && left.rangeEdges?.rowEnd === right.rangeEdges?.rowEnd
  && left.rangeEdges?.fieldStart === right.rangeEdges?.fieldStart
  && left.rangeEdges?.fieldEnd === right.rangeEdges?.fieldEnd
  && equalCell(left.focusCell, right.focusCell)
  && left.selectionVisible === right.selectionVisible
)

const equalRowRenderState = (
  left: RowRenderState,
  right: RowRenderState
) => left.selectionVisible === right.selectionVisible
  && left.selectedFieldStart === right.selectedFieldStart
  && left.selectedFieldEnd === right.selectedFieldEnd
  && left.focusFieldId === right.focusFieldId
  && left.hoverFieldId === right.hoverFieldId
  && left.fillFieldId === right.fillFieldId

export type RowRender = KeyedReadStore<ItemId, RowRenderState>

export const createRowRender = (options: {
  gridSelectionStore: ReadStore<GridSelection | null>
  valueEditorOpenStore: ReadStore<boolean>
  currentViewStore: ReadStore<CurrentView | undefined>
  capabilitiesStore: ReadStore<Capabilities>
  hoverTargetStore: ReadStore<TableHoverTarget | null>
}): RowRender => {
  const selectionChrome = createDerivedStore<SelectionChrome>({
    get: () => {
      const currentGridSelection = read(options.gridSelectionStore)
      const focusCell = gridSelection.focus(currentGridSelection)
      const currentView = read(options.currentViewStore)
      return {
        rangeEdges: currentGridSelection && currentView
          ? gridSelection.edges(currentGridSelection, currentView.items, currentView.fields)
          : undefined,
        focusCell,
        selectionVisible: !read(options.valueEditorOpenStore)
      }
    },
    isEqual: equalSelectionChrome
  })

  const fillCell = createDerivedStore<CellRef | undefined>({
    get: () => {
      if (!read(options.capabilitiesStore).showFillHandle) {
        return undefined
      }

      const currentView = read(options.currentViewStore)
      if (!currentView) {
        return undefined
      }

      return fill.handleCell(
        read(options.gridSelectionStore),
        currentView.items,
        currentView.fields
      )
    },
    isEqual: equalCell
  })

  return createKeyedDerivedStore<ItemId, RowRenderState>({
    keyOf: rowId => rowId,
    get: rowId => {
      const currentCapabilities = read(options.capabilitiesStore)
      const currentView = read(options.currentViewStore)
      const rowIndex = currentView
        ? currentView.items.indexOf(rowId)
        : undefined
      const selectionState = read(selectionChrome)
      const rangeEdges = selectionState.rangeEdges
      const selected = (
        rangeEdges
        && rowIndex !== undefined
        && rowIndex >= rangeEdges.rowStart
        && rowIndex <= rangeEdges.rowEnd
      )
      const hoverTarget = currentCapabilities.canHover
        ? read(options.hoverTargetStore)
        : null
      const fillHandleCell = read(fillCell)

      return {
        selectionVisible: selectionState.selectionVisible,
        ...(selected
          ? {
              selectedFieldStart: rangeEdges.fieldStart,
              selectedFieldEnd: rangeEdges.fieldEnd
            }
          : {}),
        ...(selectionState.focusCell?.itemId === rowId
          ? {
              focusFieldId: selectionState.focusCell.fieldId
            }
          : {}),
        ...(hoverTarget?.type === 'cell' && hoverTarget.cell.itemId === rowId
          ? {
              hoverFieldId: hoverTarget.cell.fieldId
            }
          : {}),
        ...(fillHandleCell?.itemId === rowId
          ? {
              fillFieldId: fillHandleCell.fieldId
            }
          : {})
      }
    },
    isEqual: equalRowRenderState
  })
}
