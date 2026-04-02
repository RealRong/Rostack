import {
  computeNextRotation,
  computeResizeRect,
  getResizeSourceEdges,
  getResizeUpdateRect,
  projectResizeTransformPatches,
  projectRotateTransformPatches
} from '@whiteboard/core/node'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type {
  ResizeDragState,
  RotateDragState,
  TransformInteractionCtx,
  TransformPointerInput,
  TransformProjection,
  TransformSession
} from './types'

const RESIZE_MIN_SIZE = {
  width: 20,
  height: 20
}

const ZOOM_EPSILON = 0.0001
const EMPTY_GUIDES: TransformProjection['guides'] = []

const getResizeStartRect = (
  drag: ResizeDragState
): Rect => ({
  x: drag.startCenter.x - drag.startSize.width / 2,
  y: drag.startCenter.y - drag.startSize.height / 2,
  width: drag.startSize.width,
  height: drag.startSize.height
})

const computeResizeProjection = ({
  ctx,
  session,
  drag,
  input
}: {
  ctx: TransformInteractionCtx
  session: TransformSession
  drag: ResizeDragState
  input: TransformPointerInput
}): TransformProjection => {
  const rawRect = computeResizeRect({
    drag,
    currentScreen: input.screen,
    zoom: Math.max(ctx.read.viewport.get().zoom, ZOOM_EPSILON),
    minSize: RESIZE_MIN_SIZE,
    altKey: input.modifiers.alt,
    shiftKey: input.modifiers.shift
  })
  const { sourceX, sourceY } = getResizeSourceEdges(drag.handle)
  const excludeNodeIds: readonly NodeId[] = session.targets.map((target) => target.id)

  const snapped = ctx.snap.node.resize({
    rect: rawRect.rect,
    source: {
      x: sourceX,
      y: sourceY
    },
    minSize: RESIZE_MIN_SIZE,
    excludeIds: excludeNodeIds,
    disabled: input.modifiers.alt || drag.startRotation !== 0
  })

  return {
    guides: snapped.guides,
    patches: projectResizeTransformPatches({
      startRect: getResizeStartRect(drag),
      nextRect: getResizeUpdateRect(snapped.update),
      targets: session.targets
    })
  }
}

const computeRotateProjection = ({
  session,
  drag,
  input
}: {
  session: TransformSession
  drag: RotateDragState
  input: TransformPointerInput
}): TransformProjection => ({
  guides: EMPTY_GUIDES,
  patches: projectRotateTransformPatches({
    targetId: session.targets[0]!.id,
    rotation: computeNextRotation({
      drag,
      currentPoint: input.world,
      shiftKey: input.modifiers.shift
    })
  })
})

export const projectTransform = (input: {
  ctx: TransformInteractionCtx
  session: TransformSession
  pointer: TransformPointerInput
}): TransformProjection => (
  input.session.drag.mode === 'resize'
    ? computeResizeProjection({
        ctx: input.ctx,
        session: input.session,
        drag: input.session.drag,
        input: input.pointer
      })
    : computeRotateProjection({
        session: input.session,
        drag: input.session.drag,
        input: input.pointer
      })
)
