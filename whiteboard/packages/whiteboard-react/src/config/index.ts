import { mergeValue } from '@whiteboard/core/value'
import {
  DEFAULT_BOARD_CONFIG,
  type BoardConfig as EngineBoardConfig
} from '@whiteboard/core/config'
import type { Viewport } from '@whiteboard/core/types'
import { DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG } from '@whiteboard/history'
import type { WhiteboardOptions } from '@whiteboard/react/types/common/board'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'

const ZOOM_EPSILON = 0.0001

const DEFAULT_VIEWPORT: Viewport = {
  center: { x: 0, y: 0 },
  zoom: 1
}

const DEFAULT_CONFIG: ResolvedConfig = {
  className: undefined,
  style: undefined,
  nodeSize: DEFAULT_BOARD_CONFIG.nodeSize,
  mindmapNodeSize: DEFAULT_BOARD_CONFIG.mindmapNodeSize,
  viewport: {
    initial: DEFAULT_VIEWPORT,
    minZoom: 0.1,
    maxZoom: 4,
    enablePan: true,
    enableWheel: true,
    wheelSensitivity: 0.005
  },
  node: DEFAULT_BOARD_CONFIG.node,
  edge: DEFAULT_BOARD_CONFIG.edge,
  history: DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG,
  initialTool: { type: 'select' },
  shortcuts: undefined
}

type ConfigBundle = {
  resolvedConfig: ResolvedConfig
  boardConfig: EngineBoardConfig
  viewportLimits: {
    minZoom: number
    maxZoom: number
  }
}

const normalizeConfig = (
  options?: WhiteboardOptions
): ResolvedConfig => {
  const merged = mergeValue(DEFAULT_CONFIG, options)
  const minZoom = Math.max(ZOOM_EPSILON, merged.viewport.minZoom)
  const maxZoom = Math.max(minZoom, merged.viewport.maxZoom)

  return {
    ...merged,
    viewport: {
      ...merged.viewport,
      initial: merged.viewport.initial ?? DEFAULT_VIEWPORT,
      minZoom,
      maxZoom,
      wheelSensitivity: Math.max(0, merged.viewport.wheelSensitivity)
    },
    history: {
      ...merged.history,
      capacity: Math.max(0, merged.history.capacity)
    }
  }
}

const toBoardConfig = (
  config: ResolvedConfig
): EngineBoardConfig => ({
  nodeSize: config.nodeSize,
  mindmapNodeSize: config.mindmapNodeSize,
  node: {
    groupPadding: config.node.groupPadding,
    snapThresholdScreen: config.node.snapThresholdScreen,
    snapMaxThresholdWorld: config.node.snapMaxThresholdWorld,
    snapGridCellSize: config.node.snapGridCellSize
  },
  edge: {
    hitTestThresholdScreen: config.edge.hitTestThresholdScreen,
    activationPaddingScreen: config.edge.activationPaddingScreen,
    outlineSnapMin: config.edge.outlineSnapMin,
    outlineSnapRatio: config.edge.outlineSnapRatio,
    handleSnapScreen: config.edge.handleSnapScreen
  }
})

export const resolveConfig = (
  options?: WhiteboardOptions
): ConfigBundle => {
  const resolvedConfig = normalizeConfig(options)

  return {
    resolvedConfig,
    boardConfig: toBoardConfig(resolvedConfig),
    viewportLimits: {
      minZoom: resolvedConfig.viewport.minZoom,
      maxZoom: resolvedConfig.viewport.maxZoom
    }
  }
}
