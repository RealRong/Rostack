import {
  DEFAULT_BOARD_CONFIG,
  DEFAULT_MINDMAP_NODE_SIZE,
  DEFAULT_NODE_SIZE
} from '@whiteboard/core/config'
import type { HistoryConfig } from '@whiteboard/core/kernel'
import type { MindmapLayoutMode } from '@whiteboard/core/mindmap'
import type { Size } from '@whiteboard/core/types'
export {
  DEFAULT_BOARD_CONFIG,
  DEFAULT_MINDMAP_NODE_SIZE,
  DEFAULT_NODE_SIZE
} from '@whiteboard/core/config'

export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
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
