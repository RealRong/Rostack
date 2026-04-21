import {
  geometry as geometryApi,
  type ContainerRect,
  type ViewportLimits,
  type WheelInput
} from '@whiteboard/core/geometry'
import type { Point, Rect, Viewport } from '@whiteboard/core/types'
import { equal, store } from '@shared/core'


export const DEFAULT_VIEWPORT: Viewport = {
  center: { x: 0, y: 0 },
  zoom: 1
}

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
  limits: nextLimits = geometryApi.viewport.defaultLimits
}: {
  initialViewport: Viewport
  limits?: ViewportLimits
}): ViewportRuntime => {
  const initialLimits = geometryApi.viewport.normalizeLimits(nextLimits)
  const state = store.createValueStore(
    geometryApi.viewport.normalize(initialViewport, initialLimits)
  )
  let rect = geometryApi.viewport.emptyContainerRect
  let limits = initialLimits
  const initial = geometryApi.viewport.normalize(initialViewport, initialLimits)

  const setViewport = (next: Viewport) => {
    const normalized = geometryApi.viewport.normalize(next, limits)
    const current = state.get()
    if (geometryApi.viewport.isSame(current, normalized)) {
      return
    }
    state.set(normalized)
  }

  return {
    read: {
      get: () => store.read(state),
      subscribe: (listener) => state.subscribe(listener),
      pointer: (input) => {
        const screen = geometryApi.viewport.clientToScreenPoint(
          input.clientX,
          input.clientY,
          rect
        )

        return {
          screen,
          world: geometryApi.viewport.screenToWorld(screen, store.read(state), rect)
        }
      },
      worldToScreen: (point) =>
        geometryApi.viewport.worldToScreen(point, store.read(state), rect)
    },
    commands: {
      set: (viewport) => {
        setViewport(viewport)
      },
      panBy: (delta) => {
        if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
          return
        }

        setViewport(geometryApi.viewport.pan(state.get(), delta))
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

        setViewport(geometryApi.viewport.zoom(current, factor, anchor))
      },
      fit: (bounds, padding = geometryApi.viewport.fitPadding) => {
        setViewport(geometryApi.viewport.fitToRect({
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
        geometryApi.viewport.clientToScreenPoint(clientX, clientY, rect),
      size: () => ({
        width: rect.width,
        height: rect.height
      }),
      panScreenBy: (deltaScreen) => {
        if (!Number.isFinite(deltaScreen.x) || !Number.isFinite(deltaScreen.y)) {
          return
        }

        setViewport(geometryApi.viewport.applyScreenPan(state.get(), deltaScreen))
      },
      wheel: (input, wheelSensitivity) => {
        setViewport(
          geometryApi.viewport.applyWheelInput({
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
      if (equal.sameBox(rect, next)) {
        return
      }
      rect = copyRect(next)
    },
    setLimits: (next) => {
      const normalized = geometryApi.viewport.normalizeLimits(next)
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
