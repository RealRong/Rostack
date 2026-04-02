import {
  resolveDrawPoints,
  resolveDrawStroke
} from '@whiteboard/core/node'
import type { Point } from '@whiteboard/core/types'
import type { PointerDownInput, PointerSample } from '../../types/input'
import type { InteractionCtx } from '../../runtime/interaction/ctx'
import type { DrawBrushKind } from '../../types/tool'
import type {
  DrawPreview,
  ResolvedDrawStyle
} from '../../types/draw'
import { readDrawStyle } from '../../draw/model'

const DRAW_MIN_LENGTH_SCREEN = 4
const SAMPLE_DISTANCE_SCREEN = 1

type DrawInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write'
>

type DrawPointer = {
  samples: readonly PointerSample[]
}

export type StrokeSession = {
  kind: 'stroke'
  brush: DrawBrushKind
  style: ResolvedDrawStyle
  points: readonly Point[]
  lastScreen: Point
  lengthScreen: number
}

const readZoom = (
  ctx: DrawInteractionCtx
) => ctx.read.viewport.get().zoom

const readStyle = (
  ctx: DrawInteractionCtx,
  kind: DrawBrushKind
) => readDrawStyle(
  ctx.read.draw.preferences.get(),
  kind
)

const resolveStrokePoints = (
  ctx: DrawInteractionCtx,
  points: readonly Point[]
) => resolveDrawPoints({
  points,
  zoom: readZoom(ctx)
})

export const clearStrokeOverlay = (
  ctx: DrawInteractionCtx
) => {
  ctx.write.preview.draw.setPreview(null)
}

const writeStrokePreview = (
  ctx: DrawInteractionCtx,
  session: StrokeSession
) => {
  ctx.write.preview.draw.setPreview({
    kind: session.brush,
    style: session.style,
    points: resolveStrokePoints(ctx, session.points)
  })
}

const hasMovedEnough = (
  left: Point,
  right: Point
) => {
  const dx = right.x - left.x
  const dy = right.y - left.y
  return (dx * dx) + (dy * dy) >= SAMPLE_DISTANCE_SCREEN * SAMPLE_DISTANCE_SCREEN
}

const appendStrokeSample = (
  session: StrokeSession,
  sample: PointerSample,
  force = false
): StrokeSession => {
  const previous = session.points[session.points.length - 1]

  if (!force && !hasMovedEnough(session.lastScreen, sample.screen)) {
    return session
  }

  if (
    previous
    && previous.x === sample.world.x
    && previous.y === sample.world.y
  ) {
    return session.lastScreen.x === sample.screen.x
      && session.lastScreen.y === sample.screen.y
      ? session
      : {
          ...session,
          lastScreen: sample.screen
        }
  }

  return {
    ...session,
    points: [...session.points, sample.world],
    lengthScreen:
      session.lengthScreen
      + Math.hypot(
          sample.screen.x - session.lastScreen.x,
          sample.screen.y - session.lastScreen.y
        ),
    lastScreen: sample.screen
  }
}

export const startStrokeSession = (
  ctx: DrawInteractionCtx,
  input: PointerDownInput
): StrokeSession | null => {
  const tool = ctx.read.tool.get()

  if (
    tool.type !== 'draw'
    || tool.kind === 'eraser'
    || input.pick.kind !== 'background'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  return {
    kind: 'stroke',
    brush: tool.kind,
    style: readStyle(ctx, tool.kind),
    points: [input.world],
    lastScreen: input.screen,
    lengthScreen: 0
  }
}

export const stepStrokeSession = (
  session: StrokeSession,
  input: DrawPointer,
  force = false
) => {
  let nextSession = session

  for (let index = 0; index < input.samples.length; index += 1) {
    nextSession = appendStrokeSample(
      nextSession,
      input.samples[index]!,
      force && index === input.samples.length - 1
    )
  }

  return nextSession
}

export const writeStrokeSession = (
  ctx: DrawInteractionCtx,
  previous: StrokeSession,
  next: StrokeSession
) => {
  if (previous.points !== next.points) {
    writeStrokePreview(ctx, next)
  }
}

export const commitStrokeSession = (
  ctx: DrawInteractionCtx,
  session: StrokeSession
) => {
  if (
    session.points.length < 2
    || session.lengthScreen < DRAW_MIN_LENGTH_SCREEN
  ) {
    return
  }

  const stroke = resolveDrawStroke({
    points: resolveStrokePoints(ctx, session.points),
    width: session.style.width
  })
  if (!stroke) {
    return
  }

  ctx.write.document.node.create({
    type: 'draw',
    position: stroke.position,
    size: stroke.size,
    data: {
      points: stroke.points,
      baseSize: stroke.size
    },
    style: {
      stroke: session.style.color,
      strokeWidth: session.style.width,
      opacity: session.style.opacity
    }
  })
}
