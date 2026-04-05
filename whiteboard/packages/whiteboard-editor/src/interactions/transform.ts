import {
  finishTransform,
  getResizeUpdateRect,
  startTransform,
  stepTransform,
  type TransformPreviewPatch,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node, NodeId } from '@whiteboard/core/types'
import type {
  InteractionBinding,
  InteractionSession
} from '../runtime/interaction/types'
import { FINISH } from '../runtime/interaction/result'
import type { InteractionContext } from './context'
import { createSelectionGesture } from '../runtime/interaction/gesture'
import type { PointerDownInput } from '../types/input'
import type { TransformPickHandle } from '../types/pick'

type TransformTarget = TransformSelectionMember<Node>

const readNodeRotation = (
  node: Node
) => (
  node.type === 'group'
    ? 0
    : (typeof node.rotation === 'number' ? node.rotation : 0)
)

const RESIZE_MIN_SIZE = {
  width: 20,
  height: 20
}

const toTransformNodePatches = (
  patches: readonly TransformPreviewPatch[]
) => patches.map(({
  id,
  position,
  size,
  rotation
}) => ({
  id,
  patch: {
    position,
    size,
    rotation
  }
}))

const readTransformTarget = (
  ctx: InteractionContext,
  nodeId: NodeId
): TransformTarget | undefined => {
  const entry = ctx.read.index.node.get(nodeId)

  return entry
    ? {
      id: entry.node.id,
      node: entry.node,
      rect: entry.geometry.rect
    }
    : undefined
}

const readNodeTransformSpec = (
  ctx: InteractionContext,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformSpec<Node> | undefined => {
  const entry = ctx.read.index.node.get(nodeId)
  if (!entry || entry.node.locked) {
    return undefined
  }

  const capability = ctx.read.node.capability(entry.node)
  const target = readTransformTarget(ctx, nodeId)
  if (!target) {
    return undefined
  }

  if (handle.kind === 'resize') {
    if (!handle.direction || !capability.resize) {
      return undefined
    }

    return {
      kind: 'single-resize',
      pointerId: input.pointerId,
      target,
      handle: handle.direction,
      rotation: readNodeRotation(entry.node),
      startScreen: input.client
    }
  }

  if (!capability.rotate) {
    return undefined
  }

  return {
    kind: 'single-rotate',
    pointerId: input.pointerId,
    target,
    rotation: readNodeRotation(entry.node),
    startWorld: input.world
  }
}

const readSelectionTransformSpec = (
  ctx: InteractionContext,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformSpec<Node> | undefined => {
  const selection = ctx.read.selection.summary.get()
  const affordance = ctx.read.selection.affordance.get()
  if (
    !affordance.transformBox
    || handle.kind !== 'resize'
    || !handle.direction
    || !affordance.canResize
  ) {
    return undefined
  }

  const resolved = ctx.read.node.transformTargets(selection.target.nodeIds)
  if (!resolved?.targets.length) {
    return undefined
  }

  return {
    kind: 'multi-scale',
    pointerId: input.pointerId,
    box: affordance.transformBox,
    targets: resolved.targets as readonly TransformTarget[],
    commitIds: resolved.commitIds,
    handle: handle.direction,
    startScreen: input.client
  }
}

const resolveTransformSpec = (
  ctx: InteractionContext,
  input: PointerDownInput
): TransformSpec<Node> | null => {
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
    return readNodeTransformSpec(ctx, input.pick.id, input.pick.handle, input) ?? null
  }

  return readSelectionTransformSpec(ctx, input.pick.handle, input) ?? null
}

const createTransformSession = (
  ctx: InteractionContext,
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = startTransform(spec)
  let modifiers = start.modifiers
  let interaction = null as InteractionSession | null

  const project = (
    input: Pick<PointerDownInput, 'screen' | 'world' | 'modifiers'>
  ) => {
    modifiers = input.modifiers
    const result = stepTransform({
      state,
      screen: input.screen,
      world: input.world,
      modifiers: {
        alt: input.modifiers.alt,
        shift: input.modifiers.shift
      },
      zoom: ctx.read.viewport.get().zoom,
      minSize: RESIZE_MIN_SIZE,
      snap: (resize) => {
        const snapped = ctx.snap.node.resize(resize)
        return {
          rect: getResizeUpdateRect(snapped.update),
          guides: snapped.guides
        }
      }
    })
    state = result.state
    interaction!.gesture = createSelectionGesture(
      'selection-transform',
      {
        nodePatches: toTransformNodePatches(result.draft.nodePatches),
        edgePatches: [],
        frameHoverId: undefined,
        marquee: undefined,
        guides: result.draft.guides
      }
    )
  }

  interaction = {
    mode: 'node-transform',
    pointerId: spec.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        project({
          screen: ctx.read.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.read.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)

      const updates = finishTransform(state)
      if (updates.length > 0) {
        ctx.write.document.node.document.updateMany(updates)
      }

      return FINISH
    },
    cleanup: () => { }
  }

  return interaction
}

export const startTransformInteraction = (
  ctx: InteractionContext,
  input: PointerDownInput
) => {
  const spec = resolveTransformSpec(ctx, input)

  return spec
    ? createTransformSession(ctx, spec, {
      modifiers: input.modifiers
    })
    : null
}

export const createTransformInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'transform',
  start: (input) => startTransformInteraction(ctx, input)
})
