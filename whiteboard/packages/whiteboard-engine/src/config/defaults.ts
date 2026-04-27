import type { MindmapLayoutMode } from '@whiteboard/core/mindmap'
import type { Size } from '@whiteboard/core/types'

export type BoardConfig = {
  node: {
    groupPadding: number
    snapThresholdScreen: number
    snapMaxThresholdWorld: number
    snapGridCellSize: number
  }
  edge: {
    connectQueryRadius: number
    hitTestThresholdScreen: number
    activationPaddingScreen: number
    outlineSnapMin: number
    outlineSnapRatio: number
    handleSnapScreen: number
  }
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  node: {
    groupPadding: 24,
    snapThresholdScreen: 8,
    snapMaxThresholdWorld: 24,
    snapGridCellSize: 240
  },
  edge: {
    connectQueryRadius: 24,
    hitTestThresholdScreen: 10,
    activationPaddingScreen: 24,
    outlineSnapMin: 12,
    outlineSnapRatio: 0.18,
    handleSnapScreen: 14
  }
}

export const DEFAULT_TUNING = {
  nodeTransform: {
    minSize: {
      width: 20,
      height: 20
    } as Size,
    rotateHandleOffset: 24,
    rotateSnapStep: 15
  },
  nodeDrag: {
    snapCrossThresholdRatio: 0.6
  },
  group: {
    rectEpsilon: 0.5
  },
  edge: {
    anchorOffset: 0.5
  },
  mindmap: {
    defaultMode: 'simple' as MindmapLayoutMode,
    defaultSide: 'right' as const,
    dropSnapThreshold: 24,
    rootMoveThreshold: 0.5,
    reorderLineGap: 6,
    reorderLineOverflow: 12
  },
  shortcuts: {
    duplicateOffset: {
      x: 24,
      y: 24
    }
  },
  query: {
    snapGridPaddingFactor: 6
  }
} as const
