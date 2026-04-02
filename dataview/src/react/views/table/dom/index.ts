import {
  type AppearanceId,
  type FieldId
} from '@dataview/react/currentView'
import {
  pageScrollNode,
  type ScrollNode
} from '@dataview/react/dom/scroll'
import type { Nodes } from './registry'
import type { TableLayout } from '../layout'

export interface Dom {
  container: () => HTMLDivElement | null
  canvas: () => HTMLDivElement | null
  scrollRoot: () => ScrollNode | null
  row: (rowId: AppearanceId) => HTMLElement | null
  cell: (cell: FieldId) => HTMLElement | null
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
