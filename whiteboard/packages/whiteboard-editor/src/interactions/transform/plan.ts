import { getRectCenter } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type { PointerDownInput } from '../../types/input'
import type {
  RotateDragState,
  ResizeDragState,
  TransformInteractionCtx,
  TransformPickHandle,
  TransformPlan,
  TransformTarget
} from './types'

const ZOOM_EPSILON = 0.0001

const createResizeDrag = (options: {
  pointerId: number
  handle: NonNullable<TransformPickHandle['direction']>
  rect: TransformTarget['rect']
  rotation: number
  startScreen: {
    x: number
    y: number
  }
}): ResizeDragState => ({
  mode: 'resize',
  pointerId: options.pointerId,
  handle: options.handle,
  startScreen: options.startScreen,
  startCenter: getRectCenter(options.rect),
  startRotation: options.rotation,
  startSize: {
    width: options.rect.width,
    height: options.rect.height
  },
  startAspect: options.rect.width / Math.max(options.rect.height, ZOOM_EPSILON)
})

const createRotateDrag = (options: {
  pointerId: number
  rect: TransformTarget['rect']
  rotation: number
  start: PointerDownInput['world']
}): RotateDragState => {
  const center = getRectCenter(options.rect)

  return {
    mode: 'rotate',
    pointerId: options.pointerId,
    startAngle: Math.atan2(options.start.y - center.y, options.start.x - center.x),
    startRotation: options.rotation,
    center
  }
}

const createSingleResizePlan = (options: {
  target: TransformTarget
  input: PointerDownInput
  direction: NonNullable<TransformPickHandle['direction']>
  rotation: number
}): TransformPlan => ({
  kind: 'single-resize',
  target: options.target,
  drag: createResizeDrag({
    pointerId: options.input.pointerId,
    handle: options.direction,
    rect: options.target.rect,
    rotation: options.rotation,
    startScreen: options.input.client
  })
})

const createSingleRotatePlan = (options: {
  target: TransformTarget
  input: PointerDownInput
  rotation: number
}): TransformPlan => ({
  kind: 'single-rotate',
  target: options.target,
  drag: createRotateDrag({
    pointerId: options.input.pointerId,
    rect: options.target.rect,
    rotation: options.rotation,
    start: options.input.world
  })
})

const createMultiScalePlan = (options: {
  box: TransformTarget['rect']
  targets: readonly TransformTarget[]
  commitIds: ReadonlySet<NodeId>
  input: PointerDownInput
  direction: NonNullable<TransformPickHandle['direction']>
}): TransformPlan => ({
  kind: 'multi-scale',
  box: options.box,
  targets: options.targets,
  commitIds: options.commitIds,
  drag: createResizeDrag({
    pointerId: options.input.pointerId,
    handle: options.direction,
    rect: options.box,
    rotation: 0,
    startScreen: options.input.client
  })
})

const readNodeTransformPlan = (
  ctx: TransformInteractionCtx,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformPlan | undefined => {
  const entry = ctx.read.index.node.get(nodeId)
  if (!entry || entry.node.locked) {
    return undefined
  }

  const capability = ctx.read.node.capability(entry.node)
  const target: TransformTarget = {
    id: entry.node.id,
    node: entry.node,
    rect: entry.rect
  }

  if (handle.kind === 'resize') {
    if (!handle.direction || !capability.resize) {
      return undefined
    }

    return createSingleResizePlan({
      target,
      input,
      direction: handle.direction,
      rotation: entry.rotation
    })
  }

  if (!capability.rotate) {
    return undefined
  }

  return createSingleRotatePlan({
    target,
    input,
    rotation: entry.rotation
  })
}

const readSelectionTransformPlan = (
  ctx: TransformInteractionCtx,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformPlan | undefined => {
  const selection = ctx.read.selection.summary.get()
  const selectionBox = ctx.read.selection.affordance.get()
  if (
    !selectionBox.transformBox
    || handle.kind !== 'resize'
    || !handle.direction
    || !selectionBox.canResize
  ) {
    return undefined
  }

  const resolved = ctx.read.node.transformTargets(selection.target.nodeIds)
  if (!resolved?.targets.length) {
    return undefined
  }

  return createMultiScalePlan({
    box: selectionBox.transformBox,
    targets: resolved.targets as readonly TransformTarget[],
    commitIds: resolved.commitIds,
    input,
    direction: handle.direction
  })
}

export const createTransformPlan = (
  ctx: TransformInteractionCtx,
  input: PointerDownInput
): TransformPlan | null => {
  const tool = ctx.read.tool.get()

  if (
    tool.type !== 'select'
    || (input.pick.kind !== 'node' && input.pick.kind !== 'selection-box')
    || input.pick.part !== 'transform'
    || !input.pick.handle
  ) {
    return null
  }

  if (input.pick.kind === 'node') {
    return readNodeTransformPlan(ctx, input.pick.id, input.pick.handle, input) ?? null
  }

  return readSelectionTransformPlan(ctx, input.pick.handle, input) ?? null
}
