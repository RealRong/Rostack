import type { ViewState as CurrentView } from '@dataview/engine'
import type {
  DataRecord,
  RecordId,
} from '@dataview/core/contracts'
import {
  getRecordFieldValue
} from '@dataview/core/field'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import {
  sameCellRef
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  fill,
  grid,
  range,
  gridSelection,
  type GridSelection
} from '@dataview/table'
import type { Capabilities } from './capabilities'
import { cellChrome, type CellChromeState } from './model/chrome'

export interface CellRenderState {
  exists: boolean
  value: unknown
  selected: boolean
  chrome: CellChromeState
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

  return sameCellRef(left, right)
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

const equalRenderState = (
  left: CellRenderState,
  right: CellRenderState
) => (
  left.exists === right.exists
  && Object.is(left.value, right.value)
  && left.selected === right.selected
  && left.chrome.selection === right.chrome.selection
  && left.chrome.frame === right.chrome.frame
  && left.chrome.hover === right.chrome.hover
  && left.chrome.fill === right.chrome.fill
)

const cellCacheKey = (cell: CellRef) => `${cell.itemId}\u0000${cell.fieldId}`

export type CellRender = KeyedReadStore<CellRef, CellRenderState>

export const createCellRender = (options: {
  gridSelectionStore: ReadStore<GridSelection | null>
  valueEditorOpenStore: ReadStore<boolean>
  currentViewStore: ReadStore<CurrentView | undefined>
  capabilitiesStore: ReadStore<Capabilities>
  hoverCellStore: KeyedReadStore<CellRef, boolean>
  recordStore: KeyedReadStore<RecordId, DataRecord | undefined>
}): CellRender => {
  const selectionChrome = createDerivedStore<SelectionChrome>({
    get: () => {
      const currentGridSelection = read(options.gridSelectionStore)
      const currentRange = range.from(currentGridSelection)
      const focusCell = gridSelection.focus(currentGridSelection)
      const currentView = read(options.currentViewStore)
      return {
        rangeEdges: currentRange && currentView
          ? range.edges(currentRange, currentView.items, currentView.fields)
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

  return createKeyedDerivedStore<CellRef, CellRenderState>({
    keyOf: cellCacheKey,
    get: (cell) => {
      const currentCapabilities = read(options.capabilitiesStore)
      const currentView = read(options.currentViewStore)
      const recordId = currentView?.items.get(cell.itemId)?.recordId
      const record = recordId
        ? read(options.recordStore, recordId)
        : undefined
      const rowIndex = currentView
        ? grid.appearanceIndex(currentView.items, cell.itemId)
        : undefined
      const fieldIndex = currentView
        ? grid.fieldIndex(currentView.fields, cell.fieldId)
        : undefined
      const hovered = currentCapabilities.canHover
        && read(options.hoverCellStore, cell)
      const selectionState = read(selectionChrome)
      const currentFillCell = read(fillCell)
      const rangeEdges = selectionState.rangeEdges
      const selected = (
        rangeEdges
        && rowIndex !== undefined
        && fieldIndex !== undefined
        && rowIndex >= rangeEdges.rowStart
        && rowIndex <= rangeEdges.rowEnd
        && fieldIndex >= rangeEdges.fieldStart
        && fieldIndex <= rangeEdges.fieldEnd
      ) ?? false
      const chrome = cellChrome({
        selected,
        frameActive: equalCell(selectionState.focusCell, cell),
        hovered,
        fillHandleActive: equalCell(currentFillCell, cell),
        selectionVisible: selectionState.selectionVisible
      })

      return {
        exists: Boolean(record),
        value: record
          ? getRecordFieldValue(record, cell.fieldId)
          : undefined,
        selected: chrome.selection,
        chrome
      }
    },
    isEqual: equalRenderState
  })
}
