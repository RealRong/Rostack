import { node as nodeApi,
  toSpatialNode,
  type TransformPreviewPatch,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node, NodeId } from '@whiteboard/core/types'
import type { InteractionBinding, InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { TransformPickHandle } from '@whiteboard/editor/types/pick'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import { resolveNodeEditorCapability } from '@whiteboard/editor/types/node'

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
  ...patch
}) => ({
  id,
  patch
}))

const toSpatialSelectionPlan = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sceneDerived'>,
  plan: NonNullable<ReturnType<EditorHostDeps['sceneDerived']['selection']['summary']['get']>['transformPlan']>
) => ({
  ...plan,
  members: plan.members.flatMap((member) => {
    const geometry = ctx.projection.query.scene.node(member.id)
    return geometry
      ? [{
          ...member,
          node: toSpatialNode({
            node: geometry.base.node,
            rect: geometry.geometry.rect,
            rotation: geometry.geometry.rotation
          })
        }]
      : []
  })
})

const readNodeTransformSpec = (
  ctx: Pick<EditorHostDeps, 'projection' | 'nodeType'>,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): RuntimeTransformSpec | undefined => {
  const geometry = ctx.projection.query.scene.node(nodeId)
  if (!geometry || geometry.base.node.locked) {
    return undefined
  }

  const capability = resolveNodeEditorCapability(geometry.base.node, ctx.nodeType)
  const target: TransformTarget = {
    id: geometry.base.node.id,
    node: toSpatialNode({
      node: geometry.base.node,
      rect: geometry.geometry.rect,
      rotation: geometry.geometry.rotation
    }),
    rect: geometry.geometry.rect
  }
  const rotation = geometry.geometry.rotation

  if (handle.kind === 'resize') {
    if (!handle.direction || !capability.resize) {
      return undefined
    }

    const behavior = nodeApi.transform.resolveBehavior(target.node, {
      role: capability.role,
      resize: capability.resize
    })
    if (target.node.type === 'text' && behavior) {
      const plan = nodeApi.transform.buildPlan({
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
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'nodeType' | 'sceneDerived'>,
  input: PointerDownInput
): RuntimeTransformSpec | null => {
  const tool = ctx.sessionRead.tool.get()
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

  const selection = ctx.sceneDerived.selection.summary.get()
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
    plan: toSpatialSelectionPlan(ctx, selection.transformPlan),
    rotation: 0,
    handle: input.pick.handle.direction,
    startScreen: input.client
  }
}

export const createTransformSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'layout' | 'snap' | 'write'>,
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = nodeApi.transform.start(spec)
  let modifiers = start.modifiers
  let interaction: InteractionSession | undefined

  const project = (
    input: Pick<PointerDownInput, 'screen' | 'world' | 'modifiers'>
  ) => {
    modifiers = input.modifiers
    const result = nodeApi.transform.step({
      state,
      screen: input.screen,
      world: input.world,
      modifiers: {
        alt: input.modifiers.alt,
        shift: input.modifiers.shift
      },
      zoom: ctx.sessionRead.viewport.get().zoom,
      minSize: RESIZE_MIN_SIZE,
      snap: (resize) => {
        const snapped = ctx.snap.node.resize(resize)
        return {
          rect: nodeApi.transform.resizeUpdateRect(snapped.update),
          guides: snapped.guides
        }
      }
    })
    const nextPatches = ctx.layout.runtime({
      kind: 'node.transform',
      patches: result.state.patches,
      readNode: ctx.projection.query.document.node,
      readRect: (nodeId) => ctx.projection.query.scene.node(nodeId)?.geometry.rect
    }).patches
    state = {
      ...result.state,
      patches: nextPatches
    }

    if (interaction) {
      interaction.gesture = createGesture(
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
  }

  interaction = {
    mode: 'node-transform',
    pointerId: spec.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        project({
          screen: ctx.sessionRead.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.sessionRead.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)

      const updates = nodeApi.transform.buildCommitUpdates({
        targets: state.commitTargets,
        patches: state.patches,
        commitTargetIds: state.commitIds
      })
      if (updates.length > 0) {
        ctx.write.node.updateMany(updates.map((entry) => ({
          id: entry.id,
          input: entry.update
        })))
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

export const createTransformBinding = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'layout' | 'snap' | 'write' | 'nodeType' | 'sceneDerived'>
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
