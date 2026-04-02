import { getRectCenter } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type { PointerDownInput } from '../../types/input'
import type {
  RotateDragState,
  ResizeDragState,
  TransformInteractionCtx,
  TransformPickHandle,
  TransformSession,
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

const readNodeTransformSession = (
  ctx: TransformInteractionCtx,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformSession | undefined => {
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

    return {
      targets: [target],
      drag: createResizeDrag({
        pointerId: input.pointerId,
        handle: handle.direction,
        rect: entry.rect,
        rotation: entry.rotation,
        startScreen: input.client
      })
    }
  }

  if (!capability.rotate) {
    return undefined
  }

  return {
    targets: [target],
    drag: createRotateDrag({
      pointerId: input.pointerId,
      rect: entry.rect,
      rotation: entry.rotation,
      start: input.world
    })
  }
}

const readSelectionTransformSession = (
  ctx: TransformInteractionCtx,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformSession | undefined => {
  const selection = ctx.read.selection.summary.get()
  const selectionBox = ctx.read.selection.transformBox.get()
  if (
    !selectionBox.box
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

  return {
    targets: resolved.targets as readonly TransformTarget[],
    commitTargetIds: resolved.commitIds,
    drag: createResizeDrag({
      pointerId: input.pointerId,
      handle: handle.direction,
      rect: selectionBox.box,
      rotation: 0,
      startScreen: input.client
    })
  }
}

export const startTransformSession = (
  ctx: TransformInteractionCtx,
  input: PointerDownInput
): TransformSession | null => {
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
    return readNodeTransformSession(ctx, input.pick.id, input.pick.handle, input) ?? null
  }

  return readSelectionTransformSession(ctx, input.pick.handle, input) ?? null
}
