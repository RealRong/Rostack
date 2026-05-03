import { node as nodeApi,
  toSpatialNode,
  type TransformPreviewPatch,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { EdgeId, Node, NodeId } from '@whiteboard/core/types'
import type { InteractionBinding, InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/internals/result'
import type { PointerDownInput } from '@whiteboard/editor/api/input'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { Editor } from '@whiteboard/editor/api/editor'

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
  editor: Editor,
  plan: NonNullable<ReturnType<Editor['scene']['ui']['selection']['summary']['get']>['transformPlan']>
) => ({
  ...plan,
  members: plan.members.flatMap((member) => {
    const geometry = editor.scene.nodes.get(member.id)
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

const resolveTransformSpec = (
  editor: Editor,
  input: PointerDownInput
): RuntimeTransformSpec | null => {
  const tool = editor.scene.ui.state.tool.get()
  if (
    tool.type !== 'select'
    || (input.pick.kind !== 'node' && input.pick.kind !== 'selection-box')
    || input.pick.part !== 'transform'
    || !input.pick.handle
  ) {
    return null
  }

  if (input.pick.kind === 'node') {
    const geometry = editor.scene.nodes.get(input.pick.id)
    if (!geometry) {
      return null
    }

    const capability = editor.runtime.nodeType.support(geometry.base.node)
    return nodeApi.transform.resolveSpec({
      target: {
        id: geometry.base.node.id,
        node: toSpatialNode({
          node: geometry.base.node,
          rect: geometry.geometry.rect,
          rotation: geometry.geometry.rotation
        }),
        rect: geometry.geometry.rect
      },
      rotation: geometry.geometry.rotation,
      handle: input.pick.handle,
      pointerId: input.pointerId,
      startScreen: input.client,
      startWorld: input.world,
      capability: {
        role: capability.role,
        resize: capability.resize,
        rotate: capability.rotate
      }
    }) ?? null
  }

  const selection = editor.scene.ui.selection.summary.get()
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
    plan: toSpatialSelectionPlan(editor, selection.transformPlan),
    rotation: 0,
    handle: input.pick.handle.direction,
    startScreen: input.client
  }
}

export const createTransformSession = (
  ctx: {
    editor: Editor
    layout: WhiteboardLayoutService
  },
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = nodeApi.transform.start(spec)
  let modifiers = start.modifiers

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
      zoom: ctx.editor.scene.ui.state.viewport.get().zoom,
      minSize: RESIZE_MIN_SIZE,
      snap: (resize) => {
        const snapped = ctx.editor.runtime.snap.node.resize(resize)
        return {
          rect: nodeApi.transform.resizeUpdateRect(snapped.update),
          guides: snapped.guides
        }
      }
    })
    const nextPatches = ctx.layout.runtime({
      kind: 'node.transform',
      patches: result.state.patches,
      readNode: ctx.editor.document.node,
      readRect: (nodeId) => ctx.editor.scene.nodes.get(nodeId)?.geometry.rect
    }).patches
    state = {
      ...result.state,
      patches: nextPatches
    }

    ctx.editor.state.write(({
      writer,
      snapshot
    }) => {
      const nextNodeById = new Map<NodeId, ReturnType<typeof toTransformNodePatches>[number]['patch']>(
        toTransformNodePatches(nextPatches).map((entry) => [
          entry.id,
          entry.patch
        ])
      )

      Object.keys(snapshot.preview.node).forEach((nodeId) => {
        const id = nodeId as NodeId
        const current = snapshot.preview.node[id]
        const nextPatch = nextNodeById.get(id)
        nextNodeById.delete(id)

        if (!current?.presentation && !nextPatch) {
          writer.preview.node.delete(id)
          return
        }

        if (!current) {
          if (!nextPatch) {
            return
          }

          writer.preview.node.create(id, {
            patch: nextPatch,
            hovered: false,
            hidden: false
          })
          return
        }

        if (!nextPatch && current.presentation === undefined) {
          writer.preview.node.delete(id)
          return
        }

        writer.preview.node.patch(id, {
          patch: nextPatch,
          presentation: current.presentation,
          hovered: false,
          hidden: false
        })
      })

      nextNodeById.forEach((patch, id) => {
        writer.preview.node.create(id, {
          patch,
          hovered: false,
          hidden: false
        })
      })

      Object.keys(snapshot.preview.edge).forEach((edgeId) => {
        writer.preview.edge.delete(edgeId as EdgeId)
      })
      writer.preview.selection.patch(
        {
          marquee: undefined,
          guides: result.draft.guides
        }
      )
    })
  }

  return {
    mode: 'node-transform',
    pointerId: spec.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        project({
          screen: ctx.editor.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.editor.viewport.pointer(pointer).world,
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
        ctx.editor.write.node.updateMany(updates.map((entry) => ({
          id: entry.id,
          input: entry.update
        })))
      }

      return FINISH
    },
    cleanup: () => {
      ctx.editor.state.write(({
        writer,
        snapshot
      }) => {
        Object.keys(snapshot.preview.node).forEach((nodeId) => {
          const id = nodeId as NodeId
          const current = snapshot.preview.node[id]
          if (!current?.presentation) {
            writer.preview.node.delete(id)
            return
          }

          writer.preview.node.patch(id, {
            patch: undefined,
            presentation: current.presentation,
            hovered: false,
            hidden: false
          })
        })
        Object.keys(snapshot.preview.edge).forEach((edgeId) => {
          writer.preview.edge.delete(edgeId as EdgeId)
        })
        writer.preview.selection.patch(
          {
            marquee: undefined,
            guides: []
          }
        )
      })
    }
  }
}

export const createTransformBinding = (
  ctx: {
    editor: Editor
    layout: WhiteboardLayoutService
  }
): InteractionBinding => ({
  key: 'transform',
  start: (input) => {
    const spec = resolveTransformSpec(ctx.editor, input)

    return spec
      ? createTransformSession(ctx, spec, {
          modifiers: input.modifiers
        })
      : null
  }
})
