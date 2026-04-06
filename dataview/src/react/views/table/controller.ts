import type { Engine } from '@dataview/engine'
import {
  revealElement,
  revealY
} from '@dataview/dom/scroll'
import {
  createInteractionCoordinator,
  type InteractionApi
} from '@dataview/react/interaction'
import {
  type AppearanceId,
  type CurrentView,
  type Section
} from '@dataview/react/runtime/currentView'
import type {
  Selection
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
  type ReadStore
} from '@dataview/runtime/store'
import type {
  ValueStore
} from '@dataview/runtime/store'
import type { ResolvedPageState } from '@dataview/react/page/session/types'
import type { ValueEditorApi } from '@dataview/react/runtime/valueEditor'
import {
  createCapabilities,
  type Capabilities
} from './capabilities'
import {
  createDom,
  type Dom
} from './dom'
import type { Nodes } from './dom/registry'
import {
  createCellOpener,
  type CellOpenInput
} from './openCell'
import {
  createRowHit,
  type RowHit
} from './dom/rowHit'
import { createHover, type Hover } from './hover'
import type { TableLayout } from './layout'
import { createCellRender, type CellRender } from './cellRender'
import {
  createGridSelection,
  type GridSelectionStore
} from './gridSelection'
import {
  createTableVirtualRuntime,
  type TableVirtualRuntime
} from './virtual/runtime'

export interface TableController {
  gridSelection: GridSelectionStore
  marqueeSelection: ValueStore<Selection | null>
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
  revealRow: (rowId: AppearanceId) => void
  dispose: () => void
}

export type {
  Capabilities,
  CellOpenInput,
  GridSelectionStore,
  CellRender
}

const sectionBlockHeight = (input: {
  section: Section
  rowHeight: number
  headerHeight: number
}) => input.section.collapsed
    ? input.headerHeight
    : (
      input.headerHeight
      + input.headerHeight
      + (input.section.ids.length * input.rowHeight)
    )

const flatRowTarget = (input: {
  currentView: CurrentView
  rowId: AppearanceId
  rowHeight: number
  headerHeight: number
}): {
  rowId: AppearanceId
  top: number
  bottom: number
} | null => {
  const rowIndex = input.currentView.appearances.indexOf(input.rowId)

  return rowIndex === undefined
    ? null
    : {
      rowId: input.rowId,
      top: input.headerHeight + (rowIndex * input.rowHeight),
      bottom: input.headerHeight + ((rowIndex + 1) * input.rowHeight)
    }
}

const groupedRowTarget = (input: {
  currentView: CurrentView
  rowId: AppearanceId
  rowHeight: number
  headerHeight: number
}): {
  rowId: AppearanceId
  top: number
  bottom: number
} | null => {
  let sectionTop = 0

  for (const section of input.currentView.sections) {
    const rowIndex = section.ids.indexOf(input.rowId)
    if (rowIndex !== -1) {
      const top = sectionTop + input.headerHeight + input.headerHeight + (rowIndex * input.rowHeight)
      return {
        rowId: input.rowId,
        top,
        bottom: top + input.rowHeight
      }
    }

    sectionTop += sectionBlockHeight({
      section,
      rowHeight: input.rowHeight,
      headerHeight: input.headerHeight
    })
  }

  return null
}

const rowTarget = (input: {
  currentView: CurrentView
  rowId: AppearanceId
  rowHeight: number
  headerHeight: number
}): {
  rowId: AppearanceId
  top: number
  bottom: number
} | null => input.currentView.view.query.group
    ? groupedRowTarget(input)
    : flatRowTarget(input)

const selectionRow = (input: {
  currentView: CurrentView | undefined
  selection: Selection
  gridSelection: ReturnType<GridSelectionStore['get']>
  rowHeight: number
  headerHeight: number
}): {
  rowId: AppearanceId
  top: number
  bottom: number
} | null => {
  const currentView = input.currentView
  if (!currentView) {
    return null
  }

  const rowId = input.gridSelection?.focus.appearanceId
    ?? input.selection.focus
    ?? input.selection.ids[0]
  if (!rowId) {
    return null
  }

  return rowTarget({
    currentView,
    rowId,
    rowHeight: input.rowHeight,
    headerHeight: input.headerHeight
  })
}

export const createTableController = (options: {
  engine: Engine
  pageStore: ReadStore<ResolvedPageState>
  currentViewStore: ReadStore<CurrentView | undefined>
  selectionStore: ReadStore<Selection>
  marqueeStore: ReadStore<MarqueeSessionState | null>
  valueEditor: ValueEditorApi
  layout: TableLayout
  nodes: Nodes
}): TableController => {
  const currentView = options.currentViewStore
  const gridSelection = createGridSelection(currentView)
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
  const lockedStore = createDerivedStore<boolean>({
    get: read => read(options.pageStore).lock !== null
  })
  const valueEditorOpenStore = createDerivedStore<boolean>({
    get: read => read(options.pageStore).valueEditorOpen
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
    rowId: AppearanceId
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
  const revealRow = (rowId: AppearanceId) => {
    const activeCurrentView = currentView.get()
    if (!activeCurrentView) {
      return
    }

    const target = rowTarget({
      currentView: activeCurrentView,
      rowId,
      rowHeight: options.layout.rowHeight,
      headerHeight: options.layout.headerHeight
    })
    if (!target) {
      return
    }

    revealTarget(target)
  }
  const revealCursor = () => {
    const target = selectionRow({
      currentView: currentView.get(),
      selection: options.selectionStore.get(),
      gridSelection: gridSelection.get(),
      rowHeight: options.layout.rowHeight,
      headerHeight: options.layout.headerHeight
    })
    if (!target) {
      return
    }

    revealTarget(target)
  }
  const openCell = createCellOpener({
    valueEditor: options.valueEditor,
    currentView: currentView.get,
    gridSelection,
    dom,
    revealCursor,
    focus
  })
  const cellRender = createCellRender({
    gridSelectionStore: gridSelection.store,
    valueEditorOpenStore,
    currentViewStore: currentView,
    capabilitiesStore: capabilities,
    hoverCellStore: hover.cell,
    recordStore: options.engine.read.record
  })

  return {
    gridSelection,
    marqueeSelection,
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
      gridSelection.dispose()
      marqueeSelection.set(null)
      virtual.dispose()
    }
  }
}
