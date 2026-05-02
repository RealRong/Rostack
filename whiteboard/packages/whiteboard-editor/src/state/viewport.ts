import { geometry as geometryApi, type ContainerRect, type ViewportLimits, type WheelInput } from '@whiteboard/core/geometry'
import type { Point, Rect, Viewport } from '@whiteboard/core/types'
import { equal, store } from '@shared/core'

export type EditorViewportSnapshot = Viewport

export type ViewportPointer = {
  screen: Point
  world: Point
}

export type EditorViewport = {
  get: () => EditorViewportSnapshot
  subscribe: (listener: () => void) => () => void
  pointer: (input: {
    clientX: number
    clientY: number
  }) => ViewportPointer
  worldPoint: (point: Point) => Point
  worldToScreen: (point: Point) => Point
  visibleWorldRect: () => Rect
  screenPoint: (clientX: number, clientY: number) => Point
  screenRect: (rect: Rect) => Rect
  size: () => {
    width: number
    height: number
  }
  set: (viewport: Viewport) => void
  panBy: (delta: Point) => void
  zoomTo: (zoom: number, anchor?: Point) => void
  fit: (bounds: Rect, padding?: number) => void
  reset: () => void
  panScreenBy: (deltaScreen: Point) => void
  wheel: (
    input: WheelInput,
    wheelSensitivity: number
  ) => void
  setRect: (rect: ContainerRect) => void
  setLimits: (limits: ViewportLimits) => void
  value: store.ReadStore<Viewport>
}

export const createEditorViewport = (input: {
  initialViewport: Viewport
  commit: (nextViewport: Viewport) => void
}): EditorViewport => {
  const listeners = new Set<() => void>()
  const initialLimits = geometryApi.viewport.defaultLimits
  const initialViewport = geometryApi.viewport.normalize(
    input.initialViewport,
    initialLimits
  )
  let viewport = initialViewport
  let rect = geometryApi.viewport.emptyContainerRect
  let limits = initialLimits

  const notify = () => {
    listeners.forEach((listener) => {
      listener()
    })
  }

  const commitViewport = (
    nextViewport: Viewport
  ) => {
    const normalized = geometryApi.viewport.normalize(nextViewport, limits)
    if (geometryApi.viewport.isSame(viewport, normalized)) {
      return
    }

    viewport = normalized
    input.commit(normalized)
    notify()
  }

  const readScreenPoint = (
    clientX: number,
    clientY: number
  ): Point => geometryApi.viewport.clientToScreenPoint(clientX, clientY, rect)

  const visibleWorldRect = (): Rect => geometryApi.rect.fromPoints(
    geometryApi.viewport.screenToWorld({
      x: 0,
      y: 0
    }, viewport, rect),
    geometryApi.viewport.screenToWorld({
      x: rect.width,
      y: rect.height
    }, viewport, rect)
  )

  const value = store.value({
    get: () => viewport,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isEqual: geometryApi.viewport.isSame
  })

  return {
    get: () => viewport,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    pointer: (inputPoint) => {
      const screen = readScreenPoint(inputPoint.clientX, inputPoint.clientY)

      return {
        screen,
        world: geometryApi.viewport.screenToWorld(screen, viewport, rect)
      }
    },
    worldPoint: (point) => geometryApi.viewport.screenToWorld(point, viewport, rect),
    worldToScreen: (point) => geometryApi.viewport.worldToScreen(point, viewport, rect),
    visibleWorldRect,
    screenPoint: readScreenPoint,
    screenRect: (projectedRect) => geometryApi.viewport.projectRect({
      rect: projectedRect,
      zoom: viewport.zoom,
      worldRect: visibleWorldRect()
    }),
    size: () => ({
      width: rect.width,
      height: rect.height
    }),
    set: (nextViewport) => {
      commitViewport(nextViewport)
    },
    panBy: (delta) => {
      if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
        return
      }
      commitViewport(geometryApi.viewport.pan(viewport, delta))
    },
    zoomTo: (zoom, anchor) => {
      if (!Number.isFinite(zoom) || zoom <= 0) {
        return
      }

      const factor = viewport.zoom === 0
        ? zoom
        : zoom / viewport.zoom
      if (!Number.isFinite(factor) || factor <= 0) {
        return
      }

      commitViewport(geometryApi.viewport.zoom(viewport, factor, anchor))
    },
    fit: (bounds, padding = geometryApi.viewport.fitPadding) => {
      commitViewport(geometryApi.viewport.fitToRect({
        viewport,
        rect,
        bounds,
        limits,
        padding
      }))
    },
    reset: () => {
      commitViewport(initialViewport)
    },
    panScreenBy: (deltaScreen) => {
      if (!Number.isFinite(deltaScreen.x) || !Number.isFinite(deltaScreen.y)) {
        return
      }
      commitViewport(geometryApi.viewport.applyScreenPan(
        viewport,
        deltaScreen
      ))
    },
    wheel: (wheelInput, wheelSensitivity) => {
      commitViewport(geometryApi.viewport.applyWheelInput({
        viewport,
        input: wheelInput,
        rect,
        limits,
        wheelSensitivity: Math.max(0, wheelSensitivity)
      }))
    },
    setRect: (nextRect) => {
      if (equal.sameBox(rect, nextRect)) {
        return
      }

      rect = {
        left: nextRect.left,
        top: nextRect.top,
        width: nextRect.width,
        height: nextRect.height
      }
      notify()
    },
    setLimits: (nextLimits) => {
      const normalized = geometryApi.viewport.normalizeLimits(nextLimits)
      if (
        limits.minZoom === normalized.minZoom
        && limits.maxZoom === normalized.maxZoom
      ) {
        return
      }

      limits = normalized
      commitViewport(viewport)
    },
    value
  }
}
