import type {
  ViewState as CurrentView,
  Engine
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
import type { MarqueeSessionState } from '@dataview/react/runtime/marquee'
import {
  createItemListSelectionDomain,
  selectionSnapshot
} from '@dataview/runtime/selection'
import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'
import type {
  ValueStore
} from '@shared/core'
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
import { createHover, type Hover } from '@dataview/react/views/table/hover'
import type { TableLayout } from '@dataview/react/views/table/layout'
import {
  createTableVirtualRuntime,
  type TableVirtualRuntime
} from '@dataview/react/views/table/virtual/runtime'
import {
  createTableSelectionRuntime,
  type TableSelectionRuntime
} from '@dataview/react/views/table/selectionRuntime'
import { createRowRender, type RowRender } from '@dataview/react/views/table/rowRender'
export interface TableController {
  currentView: ReadStore<CurrentView | undefined>
  locked: ReadStore<boolean>
  valueEditorOpen: ReadStore<boolean>
  selection: TableSelectionRuntime
  rowRail: ValueStore<ItemId | null>
  layout: TableLayout
  virtual: TableVirtualRuntime
  nodes: Nodes
  dom: Dom
  rowHit: RowHit
  focus: () => void
  openCell: (input: CellOpenInput) => boolean
  interaction: InteractionApi
  capabilities: ReadStore<Capabilities>
  hover: Hover
  rowRender: RowRender
  revealCursor: () => void
  revealRow: (rowId: ItemId) => void
  dispose: () => void
}

export type {
  Capabilities,
  CellOpenInput,
  RowRender,
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
  selection: ItemSelectionController
  marqueeStore: ReadStore<MarqueeSessionState | null>
  valueEditor: ValueEditorApi
  layout: TableLayout
  nodes: Nodes
}): TableController => {
  const currentView = options.currentViewStore
  const selection = createTableSelectionRuntime({
    currentViewStore: currentView,
    rowSelection: options.selection
  })
  const rowRail = createValueStore<ItemId | null>({
    initial: null,
    isEqual: Object.is
  })
  const lockedStore = createDerivedStore<boolean>({
    get: () => read(options.pageStore).lock !== null
  })
  const valueEditorOpenStore = createDerivedStore<boolean>({
    get: () => read(options.pageStore).valueEditorOpen
  })
  const interaction = createInteractionCoordinator()
  const capabilities = createCapabilities({
    currentView,
    locked: lockedStore,
    interaction: interaction.store
  })
  const hover = createHover()
  const virtual = createTableVirtualRuntime({
    currentViewStore: currentView,
    marqueeStore: options.marqueeStore,
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
  const rowRender = createRowRender({
    gridSelectionStore: selection.cells.store,
    valueEditorOpenStore,
    currentViewStore: currentView,
    capabilitiesStore: capabilities,
    hoverTargetStore: hover.target
  })

  return {
    currentView,
    locked: lockedStore,
    valueEditorOpen: valueEditorOpenStore,
    selection,
    rowRail,
    layout: options.layout,
    virtual,
    nodes: options.nodes,
    dom,
    rowHit,
    focus,
    openCell,
    interaction: interaction.api,
    capabilities,
    hover,
    rowRender,
    revealCursor,
    revealRow,
    dispose: () => {
      interaction.api.cancel()
      selection.dispose()
      rowRail.set(null)
      virtual.dispose()
    }
  }
}
