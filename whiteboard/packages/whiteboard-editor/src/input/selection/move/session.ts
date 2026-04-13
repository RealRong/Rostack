import {
  type Guide,
  type MoveStepResult,
  finishMoveState,
  startMoveState,
  stepMoveState
} from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import {
  FINISH
} from '#whiteboard-editor/input/core/result'
import type {
  InteractionSession
} from '#whiteboard-editor/input/core/types'
import type { InteractionContext } from '#whiteboard-editor/input/context'
import { createSelectionGesture } from '#whiteboard-editor/input/core/gesture'
import type {
  PointerDownInput
} from '#whiteboard-editor/types/input'
import type { SelectionMoveVisibility } from '#whiteboard-editor/input/selection/press/resolve'

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
  ctx: InteractionContext,
  nodeId: string
) => ctx.query.frame.of(nodeId)

const resolveFrameHoverId = (
  ctx: InteractionContext,
  state: Parameters<typeof finishMoveState>[0],
  pointerWorld: {
    x: number
    y: number
  }
) => {
  const movingIds = new Set(state.move.members.map((member) => member.id))
  let frameId = ctx.query.frame.at(pointerWorld)

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
  ctx: InteractionContext,
  input: MoveInteractionInput
): InteractionSession | null => {
  const initialState = startMoveState({
    nodes: ctx.query.node.ordered(),
    edges: ctx.query.edge.edges(ctx.query.edge.list.get()),
    target: input.target,
    startWorld: input.start.world,
    nodeSize: ctx.config.nodeSize
  })
  if (!initialState) {
    return null
  }
  let state = initialState
  const restoreSelection = input.visibility.kind === 'temporary'
    ? input.visibility.restore
    : undefined

  if (
    input.visibility.kind === 'show'
    || input.visibility.kind === 'temporary'
  ) {
    ctx.local.session.selection.replace(input.visibility.selection)
  }
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
    const result = stepMoveState({
      state,
      pointerWorld: nextInput.world,
      snap: ctx.query.tool.is('select')
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
    interaction!.gesture = createSelectionGesture(
      'selection-move',
      {
        nodePatches: toMoveNodePatches(result),
        edgePatches: toMoveEdgePatches(result),
        frameHoverId: resolveFrameHoverId(ctx, state, nextInput.world),
        guides,
        marquee: undefined
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
          world: ctx.query.viewport.pointer(pointer).world,
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
      const commit = finishMoveState(state)

      if (commit.delta) {
        ctx.command.node.move({
          ids: state.move.rootIds,
          delta: commit.delta
        })
      }

      if (commit.edges.length > 0) {
        ctx.command.edge.updateMany(commit.edges)
      }

      return FINISH
    },
    cleanup: () => {
      if (restoreSelection) {
        ctx.local.session.selection.replace(restoreSelection)
      }
    }
  }

  return interaction
}
