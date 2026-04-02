import {
  computeNextRotation,
  computeResizeRect,
  getResizeSourceEdges,
  getResizeUpdateRect,
  projectResizePatches
} from '@whiteboard/core/node'
import type { NodeId } from '@whiteboard/core/types'
import type {
  ResizeDragState,
  TransformInteractionCtx,
  TransformPlan,
  TransformPointerInput,
  TransformPreview
} from './types'

const RESIZE_MIN_SIZE = {
  width: 20,
  height: 20
}

const ZOOM_EPSILON = 0.0001
const EMPTY_GUIDES: TransformPreview['guides'] = []

const projectResizeFrame = (input: {
  ctx: TransformInteractionCtx
  drag: ResizeDragState
  pointer: TransformPointerInput
  excludeNodeIds: readonly NodeId[]
}) => {
  const rawRect = computeResizeRect({
    drag: input.drag,
    currentScreen: input.pointer.screen,
    zoom: Math.max(input.ctx.read.viewport.get().zoom, ZOOM_EPSILON),
    minSize: RESIZE_MIN_SIZE,
    altKey: input.pointer.modifiers.alt,
    shiftKey: input.pointer.modifiers.shift
  })
  const { sourceX, sourceY } = getResizeSourceEdges(input.drag.handle)
  const snapped = input.ctx.snap.node.resize({
    rect: rawRect.rect,
    source: {
      x: sourceX,
      y: sourceY
    },
    minSize: RESIZE_MIN_SIZE,
    excludeIds: input.excludeNodeIds,
    disabled: input.pointer.modifiers.alt || input.drag.startRotation !== 0
  })

  return {
    guides: snapped.guides,
    nextRect: getResizeUpdateRect(snapped.update)
  }
}

const projectSingleResize = (input: {
  ctx: TransformInteractionCtx
  plan: Extract<TransformPlan, { kind: 'single-resize' }>
  pointer: TransformPointerInput
}): TransformPreview => {
  const frame = projectResizeFrame({
    ctx: input.ctx,
    drag: input.plan.drag,
    pointer: input.pointer,
    excludeNodeIds: [input.plan.target.id]
  })

  return {
    guides: frame.guides,
    nodePatches: [{
      id: input.plan.target.id,
      position: {
        x: frame.nextRect.x,
        y: frame.nextRect.y
      },
      size: {
        width: frame.nextRect.width,
        height: frame.nextRect.height
      }
    }]
  }
}

const projectMultiScale = (input: {
  ctx: TransformInteractionCtx
  plan: Extract<TransformPlan, { kind: 'multi-scale' }>
  pointer: TransformPointerInput
}): TransformPreview => {
  const frame = projectResizeFrame({
    ctx: input.ctx,
    drag: input.plan.drag,
    pointer: input.pointer,
    excludeNodeIds: input.plan.targets.map((target) => target.id)
  })

  return {
    guides: frame.guides,
    nodePatches: projectResizePatches({
      startRect: input.plan.box,
      nextRect: frame.nextRect,
      members: input.plan.targets
    })
  }
}

const projectSingleRotate = (input: {
  plan: Extract<TransformPlan, { kind: 'single-rotate' }>
  pointer: TransformPointerInput
}): TransformPreview => ({
  guides: EMPTY_GUIDES,
  nodePatches: [{
    id: input.plan.target.id,
    rotation: computeNextRotation({
      drag: input.plan.drag,
      currentPoint: input.pointer.world,
      shiftKey: input.pointer.modifiers.shift
    })
  }]
})

export const projectTransform = (input: {
  ctx: TransformInteractionCtx
  plan: TransformPlan
  pointer: TransformPointerInput
}): TransformPreview => {
  switch (input.plan.kind) {
    case 'single-resize':
      return projectSingleResize({
        ctx: input.ctx,
        plan: input.plan,
        pointer: input.pointer
      })
    case 'single-rotate':
      return projectSingleRotate({
        plan: input.plan,
        pointer: input.pointer
      })
    case 'multi-scale':
      return projectMultiScale({
        ctx: input.ctx,
        plan: input.plan,
        pointer: input.pointer
      })
  }
}
