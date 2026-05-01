import { resolveEdgePressureVector } from '@shared/dom'
import { scheduler } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'

type PanVector = Point
type AutoPanPointer = {
  clientX: number
  clientY: number
}
type AutoPanOptions = NonNullable<InteractionSession['autoPan']>

type AutoPanSessionState = {
  pointer: AutoPanPointer | null
  frame?: (pointer: AutoPanPointer) => void
  threshold?: number
  maxSpeed?: number
}

const DEFAULT_THRESHOLD = 96
const DEFAULT_MAX_SPEED = 1200
const MAX_FRAME_SECONDS = 1 / 20

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const resolveAxisSpeed = (
  pressure: number,
  maxSpeed: number
) => Math.sign(pressure) * (Math.abs(pressure) ** 2) * maxSpeed

const resolvePanVector = ({
  point,
  size,
  threshold,
  maxSpeed
}: {
  point: Point
  size: {
    width: number
    height: number
  }
  threshold?: number
  maxSpeed?: number
}): PanVector => {
  const safeThreshold = Math.max(1, threshold ?? DEFAULT_THRESHOLD)
  const safeMaxSpeed = Math.max(0, maxSpeed ?? DEFAULT_MAX_SPEED)
  const pressure = resolveEdgePressureVector({
    point,
    size,
    threshold: safeThreshold
  })

  return {
    x: resolveAxisSpeed(pressure.x, safeMaxSpeed),
    y: resolveAxisSpeed(pressure.y, safeMaxSpeed)
  }
}

type AutoPan = Readonly<{
  start: (options?: AutoPanOptions) => void
  update: (pointer: AutoPanPointer) => void
  stop: () => void
  clear: () => void
}>

export const createAutoPan = ({
  getViewport
}: {
  getViewport: () => {
    screenPoint: (clientX: number, clientY: number) => Point
    size: () => {
      width: number
      height: number
    }
    panScreenBy: (deltaScreen: Point) => void
  } | null
}): AutoPan => {
  let lastFrameTime = 0
  let active: AutoPanSessionState | null = null

  const clear = () => {
    frameTask.cancel()
    lastFrameTime = 0
    active = null
  }

  const frameTask = scheduler.createFrameTask(() => {
    const timestamp = scheduler.readMonotonicNow()
    const session = active
    if (!session || !session.pointer) {
      lastFrameTime = 0
      return
    }

    const viewport = getViewport()
    if (!viewport) {
      lastFrameTime = 0
      return
    }

    const screen = viewport.screenPoint(
      session.pointer.clientX,
      session.pointer.clientY
    )
    const vector = resolvePanVector({
      point: screen,
      size: viewport.size(),
      threshold: session.threshold,
      maxSpeed: session.maxSpeed
    })
    if (vector.x === 0 && vector.y === 0) {
      lastFrameTime = 0
      return
    }

    const deltaSeconds = clamp(
      lastFrameTime === 0 ? 1 / 60 : (timestamp - lastFrameTime) / 1000,
      1 / 120,
      MAX_FRAME_SECONDS
    )
    lastFrameTime = timestamp

    viewport.panScreenBy({
      x: vector.x * deltaSeconds,
      y: vector.y * deltaSeconds
    })
    session.frame?.(session.pointer)
    schedule()
  })

  const schedule = () => {
    if (frameTask.isScheduled()) {
      return
    }

    frameTask.schedule()
  }

  const update = (pointer: AutoPanPointer) => {
    const session = active
    if (!session) {
      return
    }

    const viewport = getViewport()
    if (!viewport) {
      return
    }

    session.pointer = {
      clientX: pointer.clientX,
      clientY: pointer.clientY
    }

    const screen = viewport.screenPoint(pointer.clientX, pointer.clientY)
    const vector = resolvePanVector({
      point: screen,
      size: viewport.size(),
      threshold: session.threshold,
      maxSpeed: session.maxSpeed
    })

    if (vector.x === 0 && vector.y === 0) {
      if (!frameTask.isScheduled()) {
        lastFrameTime = 0
      }
      return
    }

    schedule()
  }

  const stop = () => {
    if (!active) {
      return
    }
    clear()
  }

  return {
    start: (options) => {
      clear()
      active = {
        pointer: null,
        frame: options?.frame,
        threshold: options?.threshold,
        maxSpeed: options?.maxSpeed
      }
    },
    update,
    stop,
    clear
  }
}
