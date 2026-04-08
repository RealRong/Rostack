import {
  DEFAULT_VIEWPORT_FIT_PADDING,
  DEFAULT_VIEWPORT_LIMITS,
  EMPTY_CONTAINER_RECT,
  applyScreenPan,
  applyWheelInput,
  clientToScreenPoint,
  fitViewportToRect,
  isSameViewport,
  normalizeViewport,
  normalizeViewportLimits,
  panViewport,
  screenToWorldPoint,
  type ContainerRect,
  type ViewportLimits,
  type WheelInput,
  worldToScreenPoint,
  zoomViewport
} from '@whiteboard/core/geometry'
import type { Point, Rect, Viewport } from '@whiteboard/core/types'
import {
  createValueStore,
  type ReadStore
} from '@shared/store'
import { isSameBoxTuple } from '@whiteboard/core/utils'

export const DEFAULT_VIEWPORT: Viewport = {
  center: { x: 0, y: 0 },
  zoom: 1
}

export type ViewportPointer = {
  screen: Point
  world: Point
}

export type ViewportRead = ReadStore<Viewport> & {
  pointer: (input: {
    clientX: number
    clientY: number
  }) => ViewportPointer
  worldToScreen: (point: Point) => Point
}

export type ViewportCommands = {
  set: (viewport: Viewport) => void
  panBy: (delta: Point) => void
  zoomTo: (zoom: number, anchor?: Point) => void
  fit: (bounds: Rect, padding?: number) => void
  reset: () => void
}

export type ViewportInputRuntime = {
  screenPoint: (clientX: number, clientY: number) => Point
  size: () => {
    width: number
    height: number
  }
  panScreenBy: (deltaScreen: Point) => void
  wheel: (
    input: WheelInput,
    wheelSensitivity: number
  ) => void
}

export type ViewportRuntime = {
  read: ViewportRead
  commands: ViewportCommands
  input: ViewportInputRuntime
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
}

const copyRect = (
  rect: ContainerRect
): ContainerRect => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height
})

export const createViewport = ({
  initialViewport,
  limits: nextLimits = DEFAULT_VIEWPORT_LIMITS
}: {
  initialViewport: Viewport
  limits?: ViewportLimits
}): ViewportRuntime => {
  const initialLimits = normalizeViewportLimits(nextLimits)
  const state = createValueStore(
    normalizeViewport(initialViewport, initialLimits)
  )
  let rect = EMPTY_CONTAINER_RECT
  let limits = initialLimits
  const initial = normalizeViewport(initialViewport, initialLimits)

  const setViewport = (next: Viewport) => {
    const normalized = normalizeViewport(next, limits)
    const current = state.get()
    if (isSameViewport(current, normalized)) {
      return
    }
    state.set(normalized)
  }

  return {
    read: {
      get: () => state.get(),
      subscribe: (listener) => state.subscribe(listener),
      pointer: (input) => {
        const screen = clientToScreenPoint(
          input.clientX,
          input.clientY,
          rect
        )

        return {
          screen,
          world: screenToWorldPoint(screen, state.get(), rect)
        }
      },
      worldToScreen: (point) =>
        worldToScreenPoint(point, state.get(), rect)
    },
    commands: {
      set: (viewport) => {
        setViewport(viewport)
      },
      panBy: (delta) => {
        if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
          return
        }

        setViewport(panViewport(state.get(), delta))
      },
      zoomTo: (zoom, anchor) => {
        if (!Number.isFinite(zoom) || zoom <= 0) {
          return
        }

        const current = state.get()
        const factor = current.zoom === 0 ? zoom : zoom / current.zoom
        if (!Number.isFinite(factor) || factor <= 0) {
          return
        }

        setViewport(zoomViewport(current, factor, anchor))
      },
      fit: (bounds, padding = DEFAULT_VIEWPORT_FIT_PADDING) => {
        setViewport(fitViewportToRect({
          viewport: state.get(),
          rect,
          bounds,
          limits,
          padding
        }))
      },
      reset: () => {
        setViewport(initial)
      }
    },
    input: {
      screenPoint: (clientX, clientY) =>
        clientToScreenPoint(clientX, clientY, rect),
      size: () => ({
        width: rect.width,
        height: rect.height
      }),
      panScreenBy: (deltaScreen) => {
        if (!Number.isFinite(deltaScreen.x) || !Number.isFinite(deltaScreen.y)) {
          return
        }

        setViewport(applyScreenPan(state.get(), deltaScreen))
      },
      wheel: (input, wheelSensitivity) => {
        setViewport(
          applyWheelInput({
            viewport: state.get(),
            input,
            rect,
            limits,
            wheelSensitivity: Math.max(0, wheelSensitivity)
          })
        )
      }
    },
    setRect: (next) => {
      if (isSameBoxTuple(rect, next)) {
        return
      }
      rect = copyRect(next)
    },
    setLimits: (next) => {
      const normalized = normalizeViewportLimits(next)
      if (
        limits.minZoom === normalized.minZoom
        && limits.maxZoom === normalized.maxZoom
      ) {
        return
      }

      limits = normalized
      setViewport(state.get())
    }
  }
}
