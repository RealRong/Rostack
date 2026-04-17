import {
  buildSelectionTransformPlan,
  buildTransformCommitUpdates,
  getResizeUpdateRect,
  readNodeRotation,
  resolveNodeTransformBehavior,
  startTransform,
  stepTransform,
  type TransformPreviewPatch,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node, NodeId } from '@whiteboard/core/types'
import type { InteractionBinding, InteractionSession } from '@whiteboard/editor/input/types'
import { FINISH } from '@whiteboard/editor/input/result'
import { createGesture } from '@whiteboard/editor/input/gesture'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { TransformPickHandle } from '@whiteboard/editor/types/pick'
import type { TextPreviewPatch } from '@whiteboard/editor/local/feedback/types'

export type TransformTarget = TransformSelectionMember<Node>
export type RuntimeTransformSpec = TransformSpec<Node>

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

const toTextTransformPreview = (
  patch: TransformPreviewPatch
): TextPreviewPatch | undefined => (
  patch.fontSize === undefined
  && patch.mode === undefined
  && patch.wrapWidth === undefined
  && patch.handle === undefined
)
  ? undefined
  : {
      fontSize: patch.fontSize,
      mode: patch.mode,
      wrapWidth: patch.wrapWidth,
      handle: patch.handle
    }

const readNodeTransformSpec = (
  ctx: InteractionContext,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): RuntimeTransformSpec | undefined => {
  const entry = ctx.query.node.canvas.get(nodeId)
  if (!entry || entry.node.locked) {
    return undefined
  }

  const capability = ctx.query.node.capability(entry.node)
  const target: TransformTarget = {
    id: entry.node.id,
    node: entry.node,
    rect: entry.geometry.rect
  }
  const rotation = readNodeRotation(entry.node)

  if (handle.kind === 'resize') {
    if (!handle.direction || !capability.resize) {
      return undefined
    }

    const behavior = resolveNodeTransformBehavior(entry.node, {
      role: capability.role,
      resize: capability.resize
    })
    if (entry.node.type === 'text' && behavior) {
      const plan = buildSelectionTransformPlan({
        box: target.rect,
        members: [{
          ...target,
          behavior
        }]
      })
      if (!plan) {
        return undefined
      }

      return {
        kind: 'selection-resize',
        pointerId: input.pointerId,
        plan,
        rotation,
        handle: handle.direction,
        startScreen: input.client
      }
    }

    return {
      kind: 'single-resize',
      pointerId: input.pointerId,
      target,
      handle: handle.direction,
      rotation,
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
    rotation,
    startWorld: input.world
  }
}

const resolveTransformSpec = (
  ctx: InteractionContext,
  input: PointerDownInput
): RuntimeTransformSpec | null => {
  const tool = ctx.query.tool.get()
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

  const selection = ctx.selection.get().summary
  if (
    !selection.transformPlan
    || input.pick.handle.kind !== 'resize'
    || !input.pick.handle.direction
  ) {
    return null
  }

  return {
    kind: 'selection-resize',
    pointerId: input.pointerId,
    plan: selection.transformPlan,
    rotation: 0,
    handle: input.pick.handle.direction,
    startScreen: input.client
  }
}

const clearTransformTextPreview = (
  ctx: InteractionContext,
  nodeIds: readonly string[]
) => {
  nodeIds.forEach((nodeId) => {
    ctx.local.feedback.node.text.clear(nodeId)
  })
}

const syncTransformTextPreview = (
  ctx: InteractionContext,
  activeNodeIds: readonly string[],
  patches: readonly TransformPreviewPatch[]
) => {
  const nextActiveNodeIds = patches.flatMap((patch) => {
    const textPreview = toTextTransformPreview(patch)
    if (!textPreview) {
      return []
    }

    return [patch.id]
  })
  const nextActiveNodeIdSet = new Set(nextActiveNodeIds)

  activeNodeIds.forEach((nodeId) => {
    if (!nextActiveNodeIdSet.has(nodeId)) {
      ctx.local.feedback.node.text.clear(nodeId)
    }
  })

  patches.forEach((patch) => {
    const textPreview = toTextTransformPreview(patch)
    if (!textPreview) {
      return
    }

    ctx.local.feedback.node.text.clearSize(patch.id)
    ctx.local.feedback.node.text.set(patch.id, textPreview)
  })

  return nextActiveNodeIds
}

export const createTransformSession = (
  ctx: InteractionContext,
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = startTransform(spec)
  let modifiers = start.modifiers
  let activeTextPreviewIds: readonly string[] = []
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
      zoom: ctx.query.viewport.get().zoom,
      minSize: RESIZE_MIN_SIZE,
      snap: (resize) => {
        const snapped = ctx.snap.node.resize(resize)
        return {
          rect: getResizeUpdateRect(snapped.update),
          guides: snapped.guides
        }
      }
    })
    const nextPatches = ctx.layout.resolvePreviewPatches(result.state.patches)
    state = {
      ...result.state,
      patches: nextPatches
    }
    activeTextPreviewIds = syncTransformTextPreview(
      ctx,
      activeTextPreviewIds,
      nextPatches
    )

    interaction!.gesture = createGesture(
      'selection-transform',
      {
        nodePatches: toTransformNodePatches(nextPatches),
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
          screen: ctx.query.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.query.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)

      const updates = buildTransformCommitUpdates({
        targets: state.commitTargets,
        patches: state.patches,
        commitTargetIds: state.commitIds
      })
      if (updates.length > 0) {
        ctx.command.node.updateMany(updates)
      }

      clearTransformTextPreview(ctx, activeTextPreviewIds)
      activeTextPreviewIds = []

      return FINISH
    },
    cleanup: () => {
      clearTransformTextPreview(ctx, activeTextPreviewIds)
      activeTextPreviewIds = []
    }
  }

  return interaction
}

export const createTransformBinding = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'transform',
  start: (input) => {
    const spec = resolveTransformSpec(ctx, input)

    return spec
      ? createTransformSession(ctx, spec, {
          modifiers: input.modifiers
        })
      : null
  }
})
