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
} from '../../runtime/interaction/result'
import type {
  InteractionSession
} from '../../runtime/interaction/types'
import type { InteractionContext } from '../context'
import { createSelectionGesture } from '../../runtime/interaction/gesture'
import type {
  PointerDownInput
} from '../../types/input'
import type { SelectionMoveVisibility } from '../../runtime/selection/press'

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
) => ctx.read.frame.of(nodeId)

const resolveFrameHoverId = (
  ctx: InteractionContext,
  state: Parameters<typeof finishMoveState>[0],
  pointerWorld: {
    x: number
    y: number
  }
) => {
  const movingIds = new Set(state.move.members.map((member) => member.id))
  let frameId = ctx.read.frame.at(pointerWorld)

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
    nodes: ctx.read.node.ordered(),
    edges: ctx.read.edge.edges(ctx.read.edge.list.get()),
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
    ctx.write.session.selection.replace(input.visibility.selection)
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
      snap: ctx.read.tool.is('select')
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
          world: ctx.read.viewport.pointer(pointer).world,
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
        ctx.write.node.move({
          ids: state.move.rootIds,
          delta: commit.delta
        })
      }

      if (commit.edges.length > 0) {
        ctx.write.edge.updateMany(commit.edges)
      }

      return FINISH
    },
    cleanup: () => {
      if (restoreSelection) {
        ctx.write.session.selection.replace(restoreSelection)
      }
    }
  }

  return interaction
}
