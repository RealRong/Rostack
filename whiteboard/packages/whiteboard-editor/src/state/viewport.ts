import type {
  ContainerRect,
  ViewportLimits,
  WheelInput
} from '@whiteboard/core/geometry'
import type { Point, Rect, Viewport } from '@whiteboard/core/types'
export type ViewportPointer = {
  screen: Point
  world: Point
}

export type ViewportRuntime = {
  get: () => Viewport
  subscribe: (listener: () => void) => () => void
  pointer: (input: {
    clientX: number
    clientY: number
  }) => ViewportPointer
  worldToScreen: (point: Point) => Point
  worldRect: () => Rect
  screenPoint: (clientX: number, clientY: number) => Point
  size: () => {
    width: number
    height: number
  }
  set: (viewport: Viewport) => Viewport
  panBy: (delta: Point) => Viewport | null
  zoomTo: (zoom: number, anchor?: Point) => Viewport | null
  fit: (bounds: Rect, padding?: number) => Viewport
  reset: () => Viewport
  panScreenBy: (deltaScreen: Point) => Viewport | null
  wheel: (
    input: WheelInput,
    wheelSensitivity: number
  ) => Viewport
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}
