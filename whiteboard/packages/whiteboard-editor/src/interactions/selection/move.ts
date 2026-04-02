import {
  type MoveStepResult,
  finishMoveSession,
  startMoveSession,
  stepMoveSession
} from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Edge } from '@whiteboard/core/types'
import type {
  InteractionCtx,
  InteractionSession,
  InteractionSessionTransition
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

type MoveInteractionInput = {
  start: PointerDownInput
  target: SelectionTarget
  prepareSelection?: SelectionTarget
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
    intent: {
      target: input.target
    },
    startWorld: input.start.world,
    nodeSize: ctx.config.nodeSize
  })
  if (!initialSession) {
    return null
  }
  let session = initialSession

  if (input.prepareSelection) {
    ctx.write.session.selection.replace(input.prepareSelection)
  }
  let allowCross = false

  const project = (input: {
    world: {
      x: number
      y: number
    }
    allowCross: boolean
  }) => {
    allowCross = input.allowCross
    const result = stepMoveSession({
      session,
      pointerWorld: input.world,
      allowCross: input.allowCross,
      snap: ctx.read.tool.is('select')
        ? ({ rect, excludeIds, allowCross }) => ctx.snap.node.move({
            rect,
            excludeIds,
            allowCross
          })
        : undefined
    })

    session = result.session
    ctx.write.preview.selection.setNodePatches(
      toMoveNodePatches(result),
      result.preview.hovered
    )
    ctx.write.preview.selection.setEdgePatches(
      toMoveEdgePatches(result)
    )
    ctx.write.preview.selection.setGuides(result.guides)
  }

  ctx.write.preview.selection.clearPreview()

  return {
    mode: 'node-drag',
    pointerId: input.start.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        project({
          world: ctx.read.viewport.pointer(pointer).world,
          allowCross
        })
      }
    },
    move: (next) => {
      project({
        world: next.world,
        allowCross: next.modifiers.alt
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
      ctx.write.preview.selection.clearPreview()
    }
  }
}
