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
  Selection,
  SelectionApi
} from '@dataview/react/runtime/selection'
import type {
  MarqueeSessionState
} from '@dataview/react/runtime/marquee'
import {
  selection as selectionHelpers
} from '@dataview/react/runtime/selection'
import {
  createDerivedStore,
  createValueStore,
  read,
  type ReadStore
} from '@shared/core'
import type {
  ValueStore
} from '@shared/core'
import type { PageState } from '@dataview/react/page/session/types'
import type { ValueEditorApi } from '@dataview/react/runtime/valueEditor'
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
import { createCellRender, type CellRender } from '@dataview/react/views/table/cellRender'
import {
  createTableVirtualRuntime,
  type TableVirtualRuntime
} from '@dataview/react/views/table/virtual/runtime'
import {
  createTableSelectionRuntime,
  type TableSelectionRuntime
} from '@dataview/react/views/table/selectionRuntime'
import type { TableVirtualLayoutSnapshot } from '@dataview/react/views/table/virtual/runtime'

export interface TableController {
  currentView: ReadStore<CurrentView | undefined>
  locked: ReadStore<boolean>
  valueEditorOpen: ReadStore<boolean>
  selection: TableSelectionRuntime
  marqueeSelection: ValueStore<Selection | null>
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
  cellRender: CellRender
  revealCursor: () => void
  revealRow: (rowId: ItemId) => void
  dispose: () => void
}

export type {
  Capabilities,
  CellOpenInput,
  CellRender,
  TableSelectionRuntime
}

const rowTargetFromLayout = (input: {
  layout: TableVirtualLayoutSnapshot
  rowId: ItemId
}): {
  rowId: ItemId
  top: number
  bottom: number
} | null => {
  const block = input.layout.blocks.find(candidate => (
    candidate.kind === 'row'
    && candidate.rowId === input.rowId
  ))
  if (!block) {
    return null
  }

  return {
    rowId: input.rowId,
    top: block.top,
    bottom: block.top + block.height
  }
}

const selectionRow = (input: {
  layout: TableVirtualLayoutSnapshot
  selection: Selection
  gridSelection: ReturnType<TableSelectionRuntime['cells']['get']>
}): {
  rowId: ItemId
  top: number
  bottom: number
} | null => {
  if (!input.layout.blocks.length) {
    return null
  }

  const rowId = input.gridSelection?.focus.itemId
    ?? input.selection.focus
    ?? input.selection.ids[0]
  if (!rowId) {
    return null
  }

  return rowTargetFromLayout({
    layout: input.layout,
    rowId
  })
}

export const createTableController = (options: {
  engine: Engine
  pageStore: ReadStore<PageState>
  currentViewStore: ReadStore<CurrentView | undefined>
  selectionApi: SelectionApi
  selectionStore: ReadStore<Selection>
  marqueeStore: ReadStore<MarqueeSessionState | null>
  valueEditor: ValueEditorApi
  layout: TableLayout
  nodes: Nodes
}): TableController => {
  const currentView = options.currentViewStore
  const selection = createTableSelectionRuntime({
    currentViewStore: currentView,
    rowSelection: options.selectionApi,
    rowSelectionStore: options.selectionStore
  })
  const marqueeSelection = createValueStore<Selection | null>({
    initial: null,
    isEqual: (left, right) => {
      if (left === right) {
        return true
      }

      if (!left || !right) {
        return false
      }

      return selectionHelpers.equal(left, right)
    }
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
    const target = rowTargetFromLayout({
      layout: virtual.layout.get(),
      rowId
    })
    if (!target) {
      return
    }

    revealTarget(target)
  }
  const revealCursor = () => {
    const target = selectionRow({
      layout: virtual.layout.get(),
      selection: options.selectionStore.get(),
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
  const cellRender = createCellRender({
    gridSelectionStore: selection.cells.store,
    valueEditorOpenStore,
    currentViewStore: currentView,
    capabilitiesStore: capabilities,
    hoverCellStore: hover.cell,
    recordStore: options.engine.select.records.byId
  })

  return {
    currentView,
    locked: lockedStore,
    valueEditorOpen: valueEditorOpenStore,
    selection,
    marqueeSelection,
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
    cellRender,
    revealCursor,
    revealRow,
    dispose: () => {
      interaction.api.cancel()
      selection.dispose()
      marqueeSelection.set(null)
      rowRail.set(null)
      virtual.dispose()
    }
  }
}
