import { mergeValue } from '@whiteboard/core/utils'
import {
  DEFAULT_BOARD_CONFIG,
  type BoardConfig as EngineBoardConfig
} from '@whiteboard/core/config'
import {
  selectTool
} from '@whiteboard/editor'
import type { WhiteboardOptions } from '../types/common/board'
import type { ResolvedConfig } from '../types/common/config'
import { DEFAULT_VIEWPORT } from './defaultViewport'

const ZOOM_EPSILON = 0.0001

const DEFAULT_CONFIG: ResolvedConfig = {
  className: undefined,
  style: undefined,
  nodeSize: DEFAULT_BOARD_CONFIG.nodeSize,
  mindmapNodeSize: DEFAULT_BOARD_CONFIG.mindmapNodeSize,
  mindmapLayout: {},
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
  history: {
    enabled: true,
    capacity: 100,
    captureSystem: true,
    captureRemote: false
  },
  initialTool: selectTool(),
  shortcuts: undefined
}

const mergeConfig = (
  defaults: ResolvedConfig,
  overrides?: WhiteboardOptions
): ResolvedConfig => mergeValue(defaults, overrides)

export const normalizeConfig = (
  options?: WhiteboardOptions
): ResolvedConfig => {
  const merged = mergeConfig(DEFAULT_CONFIG, options)
  const {
    initialTool,
    ...rest
  } = merged
  const minZoom = Math.max(ZOOM_EPSILON, merged.viewport.minZoom)
  const maxZoom = Math.max(minZoom, merged.viewport.maxZoom)

  return {
    ...rest,
    initialTool,
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

export const toBoardConfig = (
  config: ResolvedConfig
): EngineBoardConfig => ({
  nodeSize: {
    width: config.nodeSize.width,
    height: config.nodeSize.height
  },
  mindmapNodeSize: {
    width: config.mindmapNodeSize.width,
    height: config.mindmapNodeSize.height
  },
  node: {
    groupPadding: config.node.groupPadding,
    snapThresholdScreen: config.node.snapThresholdScreen,
    snapMaxThresholdWorld: config.node.snapMaxThresholdWorld,
    snapGridCellSize: config.node.snapGridCellSize
  },
  edge: {
    hitTestThresholdScreen: config.edge.hitTestThresholdScreen,
    anchorSnapMin: config.edge.anchorSnapMin,
    anchorSnapRatio: config.edge.anchorSnapRatio
  }
})

export { DEFAULT_CONFIG, DEFAULT_VIEWPORT }
