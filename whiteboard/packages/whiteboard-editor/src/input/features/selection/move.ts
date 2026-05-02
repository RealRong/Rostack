import { node as nodeApi, type Guide, type MoveStepResult } from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import {
  FINISH
} from '@whiteboard/editor/input/session/result'
import type {
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import { createMindmapDragSession, tryStartMindmapDragForNode } from '@whiteboard/editor/input/features/mindmap/drag'
import type {
  PointerDownInput
} from '@whiteboard/editor/types/input'
import type { SelectionMoveVisibility } from '@whiteboard/editor/input/features/selection/press'
import type { EditorInputContext } from '@whiteboard/editor/input/runtime'

const toMoveNodePatches = (
  result: MoveStepResult
) => result.preview.nodes.map(({ id, position }) => ({
  id,
  patch: {
    position
  }
}))

const toMoveEdgePatches = (
  result: MoveStepResult
) => result.preview.edges.map(({ id, patch }) => ({
  id,
  patch: {
    route: patch.route,
    source: patch.source,
    target: patch.target
  }
}))

const findParentFrameId = (
  ctx: Pick<EditorInputContext, 'editor'>,
  nodeId: string
) => ctx.editor.scene.frame.parent(nodeId)

const resolveFrameHoverId = (
  ctx: Pick<EditorInputContext, 'editor'>,
  state: Parameters<typeof nodeApi.move.state.finish>[0],
  pointerWorld: {
    x: number
    y: number
  }
) => {
  const movingIds = new Set(state.move.members.map((member) => member.id))
  let frameId = ctx.editor.scene.frame.pick(pointerWorld)

  while (frameId && movingIds.has(frameId)) {
    frameId = findParentFrameId(ctx, frameId)
  }

  return frameId
}

type MoveInteractionInput = {
  start: PointerDownInput
  target: SelectionTarget
  visibility: SelectionMoveVisibility
}

export const createMoveInteraction = (
  ctx: Pick<EditorInputContext, 'editor'>,
  input: MoveInteractionInput
): InteractionSession | null => {
  const pickedNodeId = (
    input.start.pick.kind === 'node'
    && (
      input.start.pick.part === 'body'
      || input.start.pick.part === 'field'
    )
    && input.target.edgeIds.length === 0
    && input.target.nodeIds.length === 1
    && input.target.nodeIds[0] === input.start.pick.id
  )
    ? input.start.pick.id
    : undefined
  const restoreSelection = input.visibility.kind === 'temporary'
    ? input.visibility.restore
    : undefined

  if (
    input.visibility.kind === 'show'
    || input.visibility.kind === 'temporary'
  ) {
    ctx.editor.dispatch({
      type: 'selection.set',
      selection: input.visibility.selection
    })
  }

  if (pickedNodeId) {
    const mindmapState = tryStartMindmapDragForNode({
      nodeId: pickedNodeId,
      pointerId: input.start.pointerId,
      world: input.start.world,
      mindmap: {
        tree: ctx.editor.scene.mindmaps.tree
      },
      node: ctx.editor.document.node
    })

    if (mindmapState) {
      const session = createMindmapDragSession(ctx, mindmapState)
      const cleanup = session.cleanup
      session.cleanup = () => {
        cleanup?.()
        if (restoreSelection) {
          ctx.editor.dispatch({
            type: 'selection.set',
            selection: restoreSelection
          })
        }
      }

      return session
    }
  }

  const moveScope = ctx.editor.scene.selection.move(input.target)
  const initialState = nodeApi.move.state.start({
    nodes: moveScope.nodes,
    edges: moveScope.edges,
    target: input.target,
    startWorld: input.start.world
  })
  if (!initialState) {
    return null
  }
  let state = initialState
  let modifiers = input.start.modifiers
  let interaction = null as InteractionSession | null

  const project = (nextInput: {
    world: {
      x: number
      y: number
    }
    modifiers: PointerDownInput['modifiers']
  }) => {
    modifiers = nextInput.modifiers
    let guides: readonly Guide[] = []
    const result = nodeApi.move.state.step({
      state,
      pointerWorld: nextInput.world,
      snap: ctx.editor.scene.ui.state.tool.is('select')
        ? ({ rect, excludeIds }) => {
            const snapped = ctx.editor.runtime.snap.node.move({
              rect,
              excludeIds,
              modifiers: nextInput.modifiers
            })
            guides = snapped.guides
            return snapped.rect
          }
        : undefined
    })

    state = result.state
    interaction!.gesture = createGesture(
      'selection-move',
      {
        nodePatches: toMoveNodePatches(result),
        edgePatches: toMoveEdgePatches(result),
        frameHoverId: resolveFrameHoverId(ctx, state, nextInput.world),
        guides
      }
    )
  }

  interaction = {
    mode: 'node-drag',
    pointerId: input.start.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        project({
          world: ctx.editor.runtime.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (next) => {
      project({
        world: next.world,
        modifiers: next.modifiers
      })
    },
    up: () => {
      const commit = nodeApi.move.state.finish(state)
      if (commit.delta) {
        ctx.editor.write.canvas.selection.move({
          nodeIds: input.target.nodeIds,
          edgeIds: input.target.edgeIds,
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {
      if (restoreSelection) {
        ctx.editor.dispatch({
          type: 'selection.set',
          selection: restoreSelection
        })
      }
    }
  }

  return interaction
}
