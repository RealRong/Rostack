import {
  type AppearanceId
} from '@dataview/engine/project'
import type {
  CellRef
} from '@dataview/engine/project'
import {
  pageScrollNode,
  type ScrollNode
} from '@shared/dom'
import type { Nodes } from './registry'
import type { TableLayout } from '../layout'

export interface Dom {
  container: () => HTMLDivElement | null
  canvas: () => HTMLDivElement | null
  scrollRoot: () => ScrollNode | null
  row: (rowId: AppearanceId) => HTMLElement | null
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
