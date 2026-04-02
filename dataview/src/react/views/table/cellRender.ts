import type {
  RecordId,
  GroupRecord
} from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  type KeyedReadStore,
  type ReadStore
} from '@dataview/runtime/store'
import {
  sameField
} from '@dataview/engine/projection/view'
import type {
  CurrentView,
  FieldId
} from '@dataview/react/view'
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
    propertyStart: number
    propertyEnd: number
  }
  focusCell?: FieldId
  selectionVisible: boolean
}

const equalCell = (
  left: FieldId | undefined,
  right: FieldId | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return sameField(left, right)
}

const equalSelectionChrome = (
  left: SelectionChrome,
  right: SelectionChrome
) => (
  left.rangeEdges?.rowStart === right.rangeEdges?.rowStart
  && left.rangeEdges?.rowEnd === right.rangeEdges?.rowEnd
  && left.rangeEdges?.propertyStart === right.rangeEdges?.propertyStart
  && left.rangeEdges?.propertyEnd === right.rangeEdges?.propertyEnd
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

const cellCacheKey = (cell: FieldId) => `${cell.appearanceId}\u0000${cell.propertyId}`

export type CellRender = KeyedReadStore<FieldId, CellRenderState>

export const createCellRender = (options: {
  gridSelectionStore: ReadStore<GridSelection | null>
  valueEditorOpenStore: ReadStore<boolean>
  currentViewStore: ReadStore<CurrentView | undefined>
  capabilitiesStore: ReadStore<Capabilities>
  hoverCellStore: KeyedReadStore<FieldId, boolean>
  recordStore: KeyedReadStore<RecordId, GroupRecord | undefined>
}): CellRender => {
  const selectionChrome = createDerivedStore<SelectionChrome>({
    get: readStore => {
      const currentGridSelection = readStore(options.gridSelectionStore)
      const currentRange = range.from(currentGridSelection)
      const focusCell = gridSelection.focus(currentGridSelection)
      const currentView = readStore(options.currentViewStore)
      return {
        rangeEdges: currentRange && currentView
          ? range.edges(currentRange, currentView.appearances, currentView.properties)
          : undefined,
        focusCell,
        selectionVisible: !readStore(options.valueEditorOpenStore)
      }
    },
    isEqual: equalSelectionChrome
  })

  const fillCell = createDerivedStore<FieldId | undefined>({
    get: readStore => {
      if (!readStore(options.capabilitiesStore).showFillHandle) {
        return undefined
      }

      const currentView = readStore(options.currentViewStore)
      if (!currentView) {
        return undefined
      }

      return fill.handleCell(
        readStore(options.gridSelectionStore),
        currentView.appearances,
        currentView.properties
      )
    },
    isEqual: equalCell
  })

  return createKeyedDerivedStore<FieldId, CellRenderState>({
    keyOf: cellCacheKey,
    get: (readStore, cell) => {
      const currentCapabilities = readStore(options.capabilitiesStore)
      const currentView = readStore(options.currentViewStore)
      const recordId = currentView?.appearances.get(cell.appearanceId)?.recordId
      const record = recordId
        ? readStore(options.recordStore, recordId)
        : undefined
      const rowIndex = currentView
        ? grid.appearanceIndex(currentView.appearances, cell.appearanceId)
        : undefined
      const propertyIndex = currentView
        ? grid.propertyIndex(currentView.properties, cell.propertyId)
        : undefined
      const hovered = currentCapabilities.canHover
        && readStore(options.hoverCellStore, cell)
      const selectionState = readStore(selectionChrome)
      const currentFillCell = readStore(fillCell)
      const rangeEdges = selectionState.rangeEdges
      const selected = (
        rangeEdges
        && rowIndex !== undefined
        && propertyIndex !== undefined
        && rowIndex >= rangeEdges.rowStart
        && rowIndex <= rangeEdges.rowEnd
        && propertyIndex >= rangeEdges.propertyStart
        && propertyIndex <= rangeEdges.propertyEnd
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
        value: record?.values[cell.propertyId],
        selected: chrome.selection,
        chrome
      }
    },
    isEqual: equalRenderState
  })
}
