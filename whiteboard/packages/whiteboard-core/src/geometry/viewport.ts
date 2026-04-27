import { getRectCenter } from '@whiteboard/core/geometry/rect'
import type { Point, Rect, Viewport } from '@whiteboard/core/types'

export type ContainerRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ViewportLimits = {
  minZoom: number
  maxZoom: number
}

export type SnapThresholdConfig = {
  snapThresholdScreen: number
  snapMaxThresholdWorld: number
}

export type WheelInput = {
  deltaX: number
  deltaY: number
  ctrlKey: boolean
  metaKey: boolean
  clientX: number
  clientY: number
}

export const EMPTY_CONTAINER_RECT: ContainerRect = {
  left: 0,
  top: 0,
  width: 0,
  height: 0
}

export const DEFAULT_VIEWPORT_LIMITS: ViewportLimits = {
  minZoom: 0.0001,
  maxZoom: Number.POSITIVE_INFINITY
}

export const DEFAULT_VIEWPORT_FIT_PADDING = 48

export const resolveInteractionZoom = (
  zoom: number,
  zoomEpsilon = 0.0001
) => Math.max(zoom, zoomEpsilon)

export const resolveScreenDistanceWorld = (
  screen: number,
  zoom: number,
  zoomEpsilon = 0.0001
) => screen / resolveInteractionZoom(zoom, zoomEpsilon)

export const resolveWorldThreshold = (
  screen: number,
  maxWorld: number,
  zoom: number,
  zoomEpsilon = 0.0001
) => Math.min(
  resolveScreenDistanceWorld(screen, zoom, zoomEpsilon),
  maxWorld
)

export const resolveSnapThresholdWorld = (
  config: SnapThresholdConfig,
  zoom: number,
  zoomEpsilon = 0.0001
) => resolveWorldThreshold(
  config.snapThresholdScreen,
  config.snapMaxThresholdWorld,
  zoom,
  zoomEpsilon
)

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const copyViewport = (viewport: Viewport): Viewport => ({
  center: {
    x: viewport.center.x,
    y: viewport.center.y
  },
  zoom: viewport.zoom
})

const assertViewport = (viewport: Viewport): Viewport => {
  if (!viewport || !viewport.center) {
    throw new Error('Viewport center is required.')
  }
  if (!Number.isFinite(viewport.center.x) || !Number.isFinite(viewport.center.y)) {
    throw new Error('Viewport center must be finite.')
  }
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
    throw new Error('Viewport zoom must be a positive finite number.')
  }
  return viewport
}

export const normalizeViewportLimits = (
  limits: ViewportLimits
): ViewportLimits => {
  const minZoom = Math.max(0.0001, limits.minZoom)
  const maxZoom = Math.max(minZoom, limits.maxZoom)
  return { minZoom, maxZoom }
}

export const normalizeViewport = (
  viewport: Viewport,
  limits: ViewportLimits
): Viewport => {
  const next = copyViewport(assertViewport(viewport))
  const normalizedLimits = normalizeViewportLimits(limits)
  next.zoom = clamp(next.zoom, normalizedLimits.minZoom, normalizedLimits.maxZoom)
  return next
}

const getScreenCenter = (rect: ContainerRect): Point => ({
  x: rect.width / 2,
  y: rect.height / 2
})

export const clientToScreenPoint = (
  clientX: number,
  clientY: number,
  rect: ContainerRect
): Point => ({
  x: clientX - rect.left,
  y: clientY - rect.top
})

export const viewportScreenToWorld = (
  point: Point,
  viewport: Viewport,
  screenCenter: Point
): Point => ({
  x: (point.x - screenCenter.x) / viewport.zoom + viewport.center.x,
  y: (point.y - screenCenter.y) / viewport.zoom + viewport.center.y
})

export const viewportWorldToScreen = (
  point: Point,
  viewport: Viewport,
  screenCenter: Point
): Point => ({
  x: (point.x - viewport.center.x) * viewport.zoom + screenCenter.x,
  y: (point.y - viewport.center.y) * viewport.zoom + screenCenter.y
})

export const screenToWorldPoint = (
  point: Point,
  viewport: Viewport,
  rect: ContainerRect
): Point => viewportScreenToWorld(point, viewport, getScreenCenter(rect))

export const worldToScreenPoint = (
  point: Point,
  viewport: Viewport,
  rect: ContainerRect
): Point => viewportWorldToScreen(point, viewport, getScreenCenter(rect))

export const projectPoint = (input: {
  point: Point
  zoom: number
  worldRect: Rect
}): Point => ({
  x: (input.point.x - input.worldRect.x) * input.zoom,
  y: (input.point.y - input.worldRect.y) * input.zoom
})

export const projectRect = (input: {
  rect: Rect
  zoom: number
  worldRect: Rect
}): Rect => {
  const topLeft = projectPoint({
    point: {
      x: input.rect.x,
      y: input.rect.y
    },
    zoom: input.zoom,
    worldRect: input.worldRect
  })
  const bottomRight = projectPoint({
    point: {
      x: input.rect.x + input.rect.width,
      y: input.rect.y + input.rect.height
    },
    zoom: input.zoom,
    worldRect: input.worldRect
  })

  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y)
  }
}

export const panViewport = (
  viewport: Viewport,
  delta: Point
): Viewport => ({
  center: {
    x: viewport.center.x + delta.x,
    y: viewport.center.y + delta.y
  },
  zoom: viewport.zoom
})

export const zoomViewport = (
  viewport: Viewport,
  factor: number,
  anchor?: Point
): Viewport => {
  if (!anchor) {
    return {
      center: viewport.center,
      zoom: viewport.zoom * factor
    }
  }

  return {
    center: {
      x: anchor.x - (anchor.x - viewport.center.x) / factor,
      y: anchor.y - (anchor.y - viewport.center.y) / factor
    },
    zoom: viewport.zoom * factor
  }
}

export const applyScreenPan = (
  viewport: Viewport,
  deltaScreen: Point
): Viewport => {
  const zoom = viewport.zoom
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return viewport
  }

  return panViewport(viewport, {
    x: deltaScreen.x / zoom,
    y: deltaScreen.y / zoom
  })
}

export const fitViewportToRect = ({
  viewport,
  rect,
  bounds,
  limits,
  padding
}: {
  viewport: Viewport
  rect: ContainerRect
  bounds: Rect
  limits: ViewportLimits
  padding: number
}): Viewport => {
  const inset = Math.max(0, padding)
  const innerWidth = rect.width - inset * 2
  const innerHeight = rect.height - inset * 2
  if (innerWidth <= 0 || innerHeight <= 0) {
    return viewport
  }

  const safeWidth = Math.max(bounds.width, 1)
  const safeHeight = Math.max(bounds.height, 1)
  const zoom = Math.min(innerWidth / safeWidth, innerHeight / safeHeight)
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return viewport
  }

  return normalizeViewport({
    center: getRectCenter(bounds),
    zoom
  }, limits)
}

export const applyWheelInput = ({
  viewport,
  input,
  rect,
  limits,
  wheelSensitivity
}: {
  viewport: Viewport
  input: WheelInput
  rect: ContainerRect
  limits: ViewportLimits
  wheelSensitivity: number
}): Viewport => {
  const zoom = viewport.zoom
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return viewport
  }

  if (!input.ctrlKey && !input.metaKey) {
    if (input.deltaX === 0 && input.deltaY === 0) {
      return viewport
    }

    return normalizeViewport(
      applyScreenPan(viewport, {
        x: input.deltaX,
        y: input.deltaY
      }),
      limits
    )
  }

  const factor = Math.exp(-input.deltaY * wheelSensitivity)
  const normalizedLimits = normalizeViewportLimits(limits)
  const nextZoom = clamp(
    zoom * factor,
    normalizedLimits.minZoom,
    normalizedLimits.maxZoom
  )
  const appliedFactor = nextZoom / zoom
  if (appliedFactor === 1) {
    return viewport
  }

  const anchorScreen = clientToScreenPoint(input.clientX, input.clientY, rect)
  const anchor = screenToWorldPoint(anchorScreen, viewport, rect)

  return normalizeViewport(
    zoomViewport(viewport, appliedFactor, anchor),
    normalizedLimits
  )
}

export const isSameViewport = (
  left: Viewport,
  right: Viewport
) =>
  left.zoom === right.zoom
  && left.center.x === right.center.x
  && left.center.y === right.center.y
