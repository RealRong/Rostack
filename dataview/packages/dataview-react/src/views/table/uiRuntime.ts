import type { CellRef, Engine, ItemId } from '@dataview/engine'
import {
  createInteractionCoordinator,
  type InteractionApi
} from '@dataview/react/interaction'
import {
  revealElement,
  revealY
} from '@shared/dom'
import {
  createItemListSelectionDomain,
  selectionSnapshot
} from '@dataview/runtime/selection'
import { store } from '@shared/core'
import type {
  Field,
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import type { PageState } from '@dataview/runtime/page/session/types'
import type {
  ItemSelectionController,
  ItemSelectionSnapshot
} from '@dataview/runtime/selection'
import type {
  TableGrid,
  TableRuntime
} from '@dataview/runtime/table'
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
import type { TableBlock } from '@dataview/react/views/table/virtual'
import {
  createTableSelectionRuntime,
  type TableSelectionRuntime
} from '@dataview/react/views/table/selectionRuntime'

export interface TableBodyRenderState {
  viewId: ViewId
  columns: readonly Field[]
  rowCount: number
  measurementIds: readonly string[]
  grouped: boolean
  showVerticalLines: boolean
  wrap: boolean
  blocks: readonly TableBlock[]
  totalHeight: number
  startTop: number
  containerWidth: number
  marqueeActive: boolean
}

const sameBodyRenderState = (
  left: TableBodyRenderState | null,
  right: TableBodyRenderState | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.columns === right.columns
  && left.rowCount === right.rowCount
  && left.measurementIds === right.measurementIds
  && left.grouped === right.grouped
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.blocks === right.blocks
  && left.totalHeight === right.totalHeight
  && left.startTop === right.startTop
  && left.containerWidth === right.containerWidth
  && left.marqueeActive === right.marqueeActive
)

export interface TableUiRuntime {
  body: store.ReadStore<TableBodyRenderState | null>
  locked: store.ReadStore<boolean>
  valueEditorOpen: store.ReadStore<boolean>
  selection: TableSelectionRuntime
  select: TableSelectRuntime
  fill: TableFillRuntime
  rail: TableRailRuntime
  can: TableCanRuntime
  chrome: {
    row: store.KeyedReadStore<ItemId, TableRowChrome>
    cell: store.KeyedReadStore<CellRef, TableCellChrome>
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
  revealCursor: () => void
  revealRow: (rowId: ItemId) => void
  dispose: () => void
}

export type {
  Capabilities,
  CellOpenInput,
  TableSelectionRuntime
}

const resolveDisplayedColumns = (input: {
  previous?: readonly Field[]
  fieldIds: readonly FieldId[]
  readField: (fieldId: FieldId) => Field | undefined
}): readonly Field[] => {
  const canReuse = Boolean(
    input.previous
    && input.previous.length === input.fieldIds.length
    && input.fieldIds.every((fieldId, index) => input.previous![index] === input.readField(fieldId))
  )
  if (canReuse) {
    return input.previous as readonly Field[]
  }

  return input.fieldIds.flatMap(fieldId => {
    const field = input.readField(fieldId)
    return field
      ? [field]
      : []
  })
}

const selectionRow = (input: {
  locateRow: (rowId: ItemId) => {
    rowId: ItemId
    top: number
    bottom: number
  } | null
  grid: TableGrid | undefined
  selection: ItemSelectionSnapshot
  gridSelection: ReturnType<TableSelectionRuntime['cells']['get']>
}): {
  rowId: ItemId
  top: number
  bottom: number
} | null => {
  const rowId = input.gridSelection?.focus.itemId
    ?? selectionSnapshot.primary(
      input.grid
        ? createItemListSelectionDomain(input.grid.items)
        : undefined,
      input.selection
    )
  if (!rowId) {
    return null
  }

  return input.locateRow(rowId)
}

export const createTableUiRuntime = (options: {
  engine: Engine
  tableRuntime: TableRuntime
  pageStore: store.ReadStore<PageState>
  selection: ItemSelectionController
  selectionMembershipStore: store.KeyedReadStore<ItemId, boolean>
  previewSelectionMembershipStore: store.KeyedReadStore<ItemId, boolean | null>
  marqueeActiveStore: store.ReadStore<boolean>
  valueEditor: ValueEditorApi
  layout: TableLayout
  nodes: Nodes
}): TableUiRuntime => {
  const grid = options.tableRuntime.grid
  const view = options.tableRuntime.view
  const selection = createTableSelectionRuntime({
    gridStore: grid,
    rowSelection: options.selection
  })
  const lockedStore = store.createDerivedStore<boolean>({
    get: () => store.read(options.pageStore).lock !== null
  })
  const valueEditorOpenStore = store.createDerivedStore<boolean>({
    get: () => store.read(options.pageStore).valueEditorOpen
  })
  const selectionVisibleStore = store.createDerivedStore<boolean>({
    get: () => !store.read(valueEditorOpenStore),
    isEqual: Object.is
  })
  const interaction = createInteractionCoordinator()
  const can = createTableCanRuntime(createCapabilities({
    view,
    locked: lockedStore,
    interaction: interaction.store
  }))
  const hover = createTableHover()
  const select = createTableSelectRuntime({
    rowMembershipStore: options.selectionMembershipStore,
    previewMembershipStore: options.previewSelectionMembershipStore,
    gridSelectionStore: selection.cells.store,
    gridStore: grid,
    visibleStore: selectionVisibleStore
  })
  const fill = createTableFillRuntime({
    gridSelectionStore: select.cells.state,
    gridStore: grid,
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
    grid,
    view,
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
      grid: grid.get(),
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
    view: view.get,
    gridSelection: selection.cells,
    dom,
    revealCursor,
    focus
  })

  let previousColumns: readonly Field[] | undefined

  const body = store.createDerivedStore<TableBodyRenderState | null>({
    get: () => {
      const currentGrid = store.read(grid)
      const currentView = store.read(view)
      if (!currentGrid || !currentView) {
        previousColumns = undefined
        return null
      }

      previousColumns = resolveDisplayedColumns({
        previous: previousColumns,
        fieldIds: currentView.displayFieldIds,
        readField: fieldId => currentGrid.fields.get(fieldId)
      })

      const windowState = store.read(virtual.window)
      const layoutState = store.read(virtual.layout)

      return {
        viewId: currentView.id,
        columns: previousColumns,
        rowCount: layoutState.rowCount,
        measurementIds: layoutState.measurementIds,
        grouped: currentView.query.group.active,
        showVerticalLines: currentView.showVerticalLines,
        wrap: currentView.wrap,
        blocks: windowState.items,
        totalHeight: windowState.totalHeight,
        startTop: windowState.startTop,
        containerWidth: store.read(virtual.viewport).containerWidth,
        marqueeActive: store.read(virtual.interaction).marqueeActive
      }
    },
    isEqual: sameBodyRenderState
  })

  return {
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
