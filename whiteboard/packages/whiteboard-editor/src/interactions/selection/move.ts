import {
  type Guide,
  type MoveStepResult,
  finishMoveSession,
  startMoveSession,
  stepMoveSession
} from '@whiteboard/core/node'
import type {
  SelectionMoveSelectionBehavior,
  SelectionTarget
} from '@whiteboard/core/selection'
import type { Edge } from '@whiteboard/core/types'
import type {
  InteractionCtx,
  InteractionSession,
  InteractionSessionTransition
} from '../../runtime/interaction'
import {
  createMoveGesture as createGesture
} from '../../runtime/interaction'
import type {
  PointerDownInput
} from '../../types/input'

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

type SelectionInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

const findParentFrameId = (
  ctx: SelectionInteractionCtx,
  nodeId: string
) => {
  let currentOwnerId = ctx.read.node.owner(nodeId)

  while (currentOwnerId) {
    const owner = ctx.read.index.node.get(currentOwnerId)?.node
    if (!owner) {
      return undefined
    }
    if (owner.type === 'frame') {
      return owner.id
    }

    currentOwnerId = ctx.read.node.owner(owner.id)
  }

  return undefined
}

const resolveFrameHoverId = (
  ctx: SelectionInteractionCtx,
  session: Parameters<typeof finishMoveSession>[0],
  pointerWorld: {
    x: number
    y: number
  }
) => {
  const movingIds = new Set(session.move.members.map((member) => member.id))
  let frameId = ctx.read.frame.at(pointerWorld)

  while (frameId && movingIds.has(frameId)) {
    frameId = findParentFrameId(ctx, frameId)
  }

  return frameId
}

type MoveInteractionInput = {
  start: PointerDownInput
  target: SelectionTarget
  selection: SelectionMoveSelectionBehavior
}

export const createMoveInteraction = (
  ctx: SelectionInteractionCtx,
  input: MoveInteractionInput
): InteractionSession | null => {
  const FINISH = {
    kind: 'finish'
  } satisfies InteractionSessionTransition

  const initialSession = startMoveSession({
    nodes: ctx.read.index.node.all().map((entry) => entry.node),
    edges: ctx.read.edge.list.get()
      .map((edgeId) => ctx.read.edge.item.get(edgeId)?.edge)
      .filter((edge): edge is Edge => Boolean(edge)),
    target: input.target,
    startWorld: input.start.world,
    nodeSize: ctx.config.nodeSize
  })
  if (!initialSession) {
    return null
  }
  let session = initialSession
  const restoreSelection = input.selection.kind === 'temporary'
    ? input.selection.restoreSelection
    : undefined
  const visibleSelection = input.selection.visibleSelection
    ?? ctx.read.selection.target.get()

  if (input.selection.visibleSelection) {
    ctx.write.session.selection.replace(input.selection.visibleSelection)
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
    const result = stepMoveSession({
      session,
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

    session = result.session
    interaction!.gesture = createGesture({
      start: {
        point: input.start.world,
        selection: visibleSelection
      },
      draft: {
        nodePatches: toMoveNodePatches(result),
        edgePatches: toMoveEdgePatches(result),
        frameHoverId: resolveFrameHoverId(ctx, session, nextInput.world),
        guides,
        marquee: undefined
      },
      meta: {
        selectionMode: restoreSelection
          ? 'restore'
          : 'keep'
      }
    })
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
      const commit = finishMoveSession(session)

      if (commit.delta) {
        ctx.write.document.node.move({
          ids: session.move.rootIds,
          delta: commit.delta
        })
      }

      if (commit.edges.length > 0) {
        ctx.write.document.edge.updateMany(commit.edges)
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
