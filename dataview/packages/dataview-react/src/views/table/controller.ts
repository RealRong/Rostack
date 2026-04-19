import type {
  ViewState as CurrentView,
  Engine,
  CellRef
} from '@dataview/engine'
import {
  revealElement,
  revealY
} from '@shared/dom'
import {
  createInteractionCoordinator,
  type InteractionApi
} from '@dataview/react/interaction'
import type { ItemId } from '@dataview/engine'
import type {
  ItemSelectionController,
  ItemSelectionSnapshot
} from '@dataview/runtime/selection'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'
import {
  createItemListSelectionDomain,
  selectionSnapshot
} from '@dataview/runtime/selection'
import {
  createDerivedStore,
  read
} from '@shared/core'
import type {
  Field,
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import type { PageState } from '@dataview/runtime/page/session/types'
import type { ValueEditorApi } from '@dataview/runtime/valueEditor'
import {
  createCapabilities,
  type Capabilities
} from '@dataview/react/views/table/capabilities'
import {
  createDom,
  type Dom
} from '@dataview/react/views/table/dom'
import type { Nodes } from '@dataview/react/views/table/dom/registry'
import {
  createCellOpener,
  type CellOpenInput
} from '@dataview/react/views/table/openCell'
import {
  createRowHit,
  type RowHit
} from '@dataview/react/views/table/dom/rowHit'
import {
  createTableCanRuntime,
  type TableCanRuntime
} from '@dataview/react/views/table/runtime/can'
import {
  createTableChromeRuntime,
  type TableCellChrome,
  type TableRowChrome
} from '@dataview/react/views/table/runtime/chrome'
import {
  createTableFillRuntime,
  type TableFillRuntime
} from '@dataview/react/views/table/runtime/fill'
import {
  createTableHover,
  type TableHoverRuntime
} from '@dataview/react/views/table/runtime/hover'
import {
  createTableRailRuntime,
  type TableRailRuntime
} from '@dataview/react/views/table/runtime/rail'
import {
  createTableSelectRuntime,
  type TableSelectRuntime
} from '@dataview/react/views/table/runtime/select'
import type { TableLayout } from '@dataview/react/views/table/layout'
import {
  createTableVirtualRuntime,
  type TableVirtualRuntime
} from '@dataview/react/views/table/virtual/runtime'
import type {
  TableBlock
} from '@dataview/react/views/table/virtual'
import {
  createTableSelectionRuntime,
  type TableSelectionRuntime
} from '@dataview/react/views/table/selectionRuntime'
import {
  type DataViewTableModel,
  type TableColumn,
  type TableSection,
  type TableSummary
} from '@dataview/runtime'

export interface TableBodyData {
  viewId: ViewId
  columns: readonly Field[]
  items: CurrentView['items']
  sections: CurrentView['sections']
  grouped: boolean
  showVerticalLines: boolean
  wrap: boolean
  blocks: readonly TableBlock[]
  totalHeight: number
  startTop: number
  containerWidth: number
  marqueeActive: boolean
}

const sameBodyData = (
  left: TableBodyData | null,
  right: TableBodyData | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.columns === right.columns
  && left.items === right.items
  && left.sections === right.sections
  && left.grouped === right.grouped
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.blocks === right.blocks
  && left.totalHeight === right.totalHeight
  && left.startTop === right.startTop
  && left.containerWidth === right.containerWidth
  && left.marqueeActive === right.marqueeActive
)

const EMPTY_ITEMS: CurrentView['items'] = {
  ids: [],
  count: 0,
  get: () => undefined,
  has: () => false,
  indexOf: () => undefined,
  at: () => undefined,
  prev: () => undefined,
  next: () => undefined,
  range: () => []
}

const EMPTY_SECTIONS: CurrentView['sections'] = {
  ids: [],
  all: [],
  get: () => undefined,
  has: () => false,
  indexOf: () => undefined,
  at: () => undefined
}

export interface TableController {
  currentView: ReadStore<CurrentView | undefined>
  body: ReadStore<TableBodyData | null>
  locked: ReadStore<boolean>
  valueEditorOpen: ReadStore<boolean>
  selection: TableSelectionRuntime
  select: TableSelectRuntime
  fill: TableFillRuntime
  rail: TableRailRuntime
  can: TableCanRuntime
  chrome: {
    row: KeyedReadStore<ItemId, TableRowChrome>
    cell: KeyedReadStore<CellRef, TableCellChrome>
  }
  layout: TableLayout
  virtual: TableVirtualRuntime
  nodes: Nodes
  dom: Dom
  rowHit: RowHit
  focus: () => void
  openCell: (input: CellOpenInput) => boolean
  interaction: InteractionApi
  hover: TableHoverRuntime
  column: KeyedReadStore<FieldId, TableColumn | undefined>
  summary: KeyedReadStore<string, TableSummary | undefined>
  section: KeyedReadStore<string, TableSection | undefined>
  revealCursor: () => void
  revealRow: (rowId: ItemId) => void
  dispose: () => void
}

export type {
  Capabilities,
  CellOpenInput,
  TableSelectionRuntime
}

const selectionRow = (input: {
  locateRow: (rowId: ItemId) => {
    rowId: ItemId
    top: number
    bottom: number
  } | null
  currentView: CurrentView | undefined
  selection: ItemSelectionSnapshot
  gridSelection: ReturnType<TableSelectionRuntime['cells']['get']>
}): {
  rowId: ItemId
  top: number
  bottom: number
} | null => {
  const rowId = input.gridSelection?.focus.itemId
    ?? selectionSnapshot.primary(
      input.currentView
        ? createItemListSelectionDomain(input.currentView.items)
        : undefined,
      input.selection
    )
  if (!rowId) {
    return null
  }

  return input.locateRow(rowId)
}

export const createTableController = (options: {
  engine: Engine
  pageStore: ReadStore<PageState>
  currentViewStore: ReadStore<CurrentView | undefined>
  model: DataViewTableModel
  selection: ItemSelectionController
  selectionMembershipStore: KeyedReadStore<ItemId, boolean>
  previewSelectionMembershipStore: KeyedReadStore<ItemId, boolean | null>
  marqueeActiveStore: ReadStore<boolean>
  valueEditor: ValueEditorApi
  layout: TableLayout
  nodes: Nodes
}): TableController => {
  const currentView = options.currentViewStore
  const selection = createTableSelectionRuntime({
    currentViewStore: currentView,
    rowSelection: options.selection
  })
  const lockedStore = createDerivedStore<boolean>({
    get: () => read(options.pageStore).lock !== null
  })
  const valueEditorOpenStore = createDerivedStore<boolean>({
    get: () => read(options.pageStore).valueEditorOpen
  })
  const selectionVisibleStore = createDerivedStore<boolean>({
    get: () => !read(valueEditorOpenStore),
    isEqual: Object.is
  })
  const interaction = createInteractionCoordinator()
  const can = createTableCanRuntime(createCapabilities({
    currentView,
    locked: lockedStore,
    interaction: interaction.store
  }))
  const hover = createTableHover()
  const select = createTableSelectRuntime({
    rowMembershipStore: options.selectionMembershipStore,
    previewMembershipStore: options.previewSelectionMembershipStore,
    gridSelectionStore: selection.cells.store,
    currentViewStore: currentView,
    visibleStore: selectionVisibleStore
  })
  const fill = createTableFillRuntime({
    gridSelectionStore: select.cells.state,
    currentViewStore: currentView,
    enabledStore: can.fill
  })
  const rail = createTableRailRuntime()
  const chrome = createTableChromeRuntime({
    rowSelected: select.rows,
    rowExposed: rail.row,
    canRowDrag: can.rowDrag,
    cellSelected: select.cells.selected,
    cellFocus: select.cells.focus,
    cellHover: hover.cell,
    cellFill: fill.cell,
    selectionVisible: select.cells.visible
  })
  const virtual = createTableVirtualRuntime({
    currentViewStore: currentView,
    marqueeActiveStore: options.marqueeActiveStore,
    layout: options.layout
  })
  const dom = createDom({
    layout: options.layout,
    nodes: options.nodes
  })
  const rowHit = createRowHit({
    containerRef: options.layout.containerRef,
    nodes: options.nodes
  })
  const focus = () => {
    dom.container()?.focus({
      preventScroll: true
    })
  }
  const revealTarget = (target: {
    rowId: ItemId
    top: number
    bottom: number
  }) => {
    const scrollNode = dom.scrollRoot()
    if (!scrollNode) {
      return
    }

    const rowNode = dom.row(target.rowId)
    if (rowNode) {
      revealElement(scrollNode, rowNode, 8)
      return
    }

    const canvas = dom.canvas()
    if (!canvas) {
      return
    }

    const canvasRect = canvas.getBoundingClientRect()
    revealY({
      node: scrollNode,
      top: canvasRect.top + target.top,
      bottom: canvasRect.top + target.bottom,
      inset: 8
    })
  }
  const revealRow = (rowId: ItemId) => {
    const target = virtual.locateRow(rowId)
    if (!target) {
      return
    }

    revealTarget(target)
  }
  const revealCursor = () => {
    const target = selectionRow({
      locateRow: virtual.locateRow,
      currentView: currentView.get(),
      selection: selection.rows.state.getSnapshot(),
      gridSelection: selection.cells.get()
    })
    if (!target) {
      return
    }

    revealTarget(target)
  }
  const openCell = createCellOpener({
    valueEditor: options.valueEditor,
    resolveCell: cell => {
      const resolved = options.engine.active.read.cell(cell)
      return resolved
        ? {
            recordId: resolved.recordId,
            fieldId: resolved.fieldId
          }
        : undefined
    },
    currentView: currentView.get,
    gridSelection: selection.cells,
    dom,
    revealCursor,
    focus
  })
  const body = createDerivedStore<TableBodyData | null>({
    get: () => {
      const bodyModel = read(options.model.body)
      if (!bodyModel) {
        return null
      }

      const current = read(currentView)
      const columns = bodyModel.columnIds.flatMap(fieldId => {
        const field = read(options.model.column, fieldId)?.field
        return field ? [field] : []
      })
      const windowState = read(virtual.window)
      return {
        viewId: bodyModel.viewId,
        columns,
        items: current?.items ?? EMPTY_ITEMS,
        sections: current?.sections ?? EMPTY_SECTIONS,
        grouped: bodyModel.grouped,
        showVerticalLines: bodyModel.showVerticalLines,
        wrap: bodyModel.wrap,
        blocks: windowState.items,
        totalHeight: windowState.totalHeight,
        startTop: windowState.startTop,
        containerWidth: read(virtual.viewport).containerWidth,
        marqueeActive: read(virtual.interaction).marqueeActive
      }
    },
    isEqual: sameBodyData
  })

  return {
    currentView,
    body,
    locked: lockedStore,
    valueEditorOpen: valueEditorOpenStore,
    selection,
    select,
    fill,
    rail,
    can,
    chrome,
    layout: options.layout,
    virtual,
    nodes: options.nodes,
    dom,
    rowHit,
    focus,
    openCell,
    interaction: interaction.api,
    hover,
    column: options.model.column,
    summary: options.model.summary,
    section: options.model.section,
    revealCursor,
    revealRow,
    dispose: () => {
      interaction.api.cancel()
      selection.dispose()
      select.dispose()
      fill.dispose()
      rail.set(null)
      virtual.dispose()
    }
  }
}
