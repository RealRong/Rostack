import {
  type ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  pageScrollNode,
  type ScrollNode
} from '@shared/dom'
import type { Nodes } from '#react/views/table/dom/registry'
import type { TableLayout } from '#react/views/table/layout'

export interface Dom {
  container: () => HTMLDivElement | null
  canvas: () => HTMLDivElement | null
  scrollRoot: () => ScrollNode | null
  row: (rowId: ItemId) => HTMLElement | null
  cell: (cell: CellRef) => HTMLElement | null
}

export const createDom = (options: {
  layout: TableLayout
  nodes: Nodes
}): Dom => {
  const container = () => options.layout.containerRef.current
  return {
    container,
    canvas: () => options.layout.canvasRef.current,
    scrollRoot: () => pageScrollNode(container()),
    row: options.nodes.row,
    cell: options.nodes.cell
  }
}
