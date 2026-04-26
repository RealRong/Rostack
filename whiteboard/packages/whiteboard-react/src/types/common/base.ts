import type { Viewport } from '@whiteboard/core/types'

export type Size = { width: number; height: number }

export type ViewportConfig = {
  initial?: Viewport
  minZoom?: number
  maxZoom?: number
  enablePan?: boolean
  enableWheel?: boolean
  wheelSensitivity?: number
}

export type NodeConfig = {
  groupPadding?: number
  snapThresholdScreen?: number
  snapMaxThresholdWorld?: number
  snapGridCellSize?: number
}

export type EdgeConfig = {
  connectQueryRadius?: number
  hitTestThresholdScreen?: number
  activationPaddingScreen?: number
  outlineSnapMin?: number
  outlineSnapRatio?: number
  handleSnapScreen?: number
}
