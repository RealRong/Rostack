import type { Size } from '../types'

export type BoardConfig = {
  nodeSize: Size
  mindmapNodeSize: Size
  node: {
    groupPadding: number
    snapThresholdScreen: number
    snapMaxThresholdWorld: number
    snapGridCellSize: number
  }
  edge: {
    hitTestThresholdScreen: number
    activationPaddingScreen: number
    outlineSnapMin: number
    outlineSnapRatio: number
    handleSnapScreen: number
  }
}

export const DEFAULT_NODE_SIZE: Size = {
  width: 120,
  height: 72
}

export const DEFAULT_MINDMAP_NODE_SIZE: Size = {
  width: 140,
  height: 36
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  nodeSize: DEFAULT_NODE_SIZE,
  mindmapNodeSize: DEFAULT_MINDMAP_NODE_SIZE,
  node: {
    groupPadding: 24,
    snapThresholdScreen: 8,
    snapMaxThresholdWorld: 24,
    snapGridCellSize: 240
  },
  edge: {
    hitTestThresholdScreen: 10,
    activationPaddingScreen: 24,
    outlineSnapMin: 12,
    outlineSnapRatio: 0.18,
    handleSnapScreen: 14
  }
}
