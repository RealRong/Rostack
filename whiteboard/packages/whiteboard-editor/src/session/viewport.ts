import type {
  ContainerRect,
  ViewportLimits,
  WheelInput
} from '@whiteboard/core/geometry'
import type { Point, Rect, Viewport } from '@whiteboard/core/types'
import { store } from '@shared/core'

export type ViewportPointer = {
  screen: Point
  world: Point
}

export type ViewportRead = store.ReadStore<Viewport> & {
  pointer: (input: {
    clientX: number
    clientY: number
  }) => ViewportPointer
  worldToScreen: (point: Point) => Point
  worldRect: () => Rect
}

export type ViewportInputRuntime = {
  screenPoint: (clientX: number, clientY: number) => Point
  size: () => {
    width: number
    height: number
  }
}

export type ViewportResolver = {
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
}

export type ViewportRuntime = {
  read: ViewportRead
  input: ViewportInputRuntime
  resolve: ViewportResolver
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}
