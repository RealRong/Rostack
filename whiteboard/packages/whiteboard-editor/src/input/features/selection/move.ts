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
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import { toSpatialNode } from '@whiteboard/editor/read/node'

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
  ctx: Pick<EditorHostDeps, 'document'>,
  nodeId: string
) => ctx.document.frame.of(nodeId)

const resolveFrameHoverId = (
  ctx: Pick<EditorHostDeps, 'document'>,
  state: Parameters<typeof nodeApi.move.state.finish>[0],
  pointerWorld: {
    x: number
    y: number
  }
) => {
  const movingIds = new Set(state.move.members.map((member) => member.id))
  let frameId = ctx.document.frame.at(pointerWorld)

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
  ctx: Pick<EditorHostDeps, 'engine' | 'document' | 'projection' | 'sessionRead' | 'snap' | 'write' | 'actions'>,
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
    ctx.actions.selection.replace(input.visibility.selection)
  }

  if (pickedNodeId) {
    const mindmapState = tryStartMindmapDragForNode({
      nodeId: pickedNodeId,
      pointerId: input.start.pointerId,
      world: input.start.world,
      mindmap: {
        structure: ctx.document.mindmap.structure,
        layout: ctx.projection.mindmap.view
      },
      node: ctx.document
    })

    if (mindmapState) {
      const session = createMindmapDragSession(ctx, mindmapState)
      const cleanup = session.cleanup
      session.cleanup = () => {
        cleanup?.()
        if (restoreSelection) {
          ctx.actions.selection.replace(restoreSelection)
        }
      }

      return session
    }
  }

  const initialState = nodeApi.move.state.start({
    nodes: ctx.projection.node.ordered().flatMap((node) => {
      const view = ctx.projection.node.view.get(node.id)
      return view
        ? [toSpatialNode({
            node: view.base.node,
            rect: view.layout.rect,
            rotation: view.layout.rotation
          })]
        : []
    }),
    edges: ctx.projection.edge.edges(ctx.document.edge.list.get()),
    target: input.target,
    startWorld: input.start.world,
    nodeSize: ctx.engine.config.nodeSize
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
      snap: ctx.sessionRead.tool.is('select')
        ? ({ rect, excludeIds }) => {
            const snapped = ctx.snap.node.move({
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
          world: ctx.sessionRead.viewport.pointer(pointer).world,
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
        ctx.write.canvas.selection.move({
          nodeIds: input.target.nodeIds,
          edgeIds: input.target.edgeIds,
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {
      if (restoreSelection) {
        ctx.actions.selection.replace(restoreSelection)
      }
    }
  }

  return interaction
}
