import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/core/result'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import {
  commitMindmapDrag,
  previewMindmapDrag,
  stepMindmapDrag,
  type MindmapDragState
} from '@whiteboard/editor/input/mindmap/drag/start'

const applyMindmapPreview = (
  ctx: InteractionContext,
  state: MindmapDragState
) => {
  ctx.local.feedback.mindmap.setDrag(
    previewMindmapDrag(state)
  )
}

export const createMindmapSession = (
  ctx: InteractionContext,
  initial: MindmapDragState
): InteractionSession => {
  let state = initial
  applyMindmapPreview(ctx, state)

  const project = (
    world: {
      x: number
      y: number
    }
  ) => {
    state = stepMindmapDrag({
      state,
      world,
      mindmap: ctx.query.mindmap
    })
    applyMindmapPreview(ctx, state)
  }

  return {
    mode: 'mindmap-drag',
    pointerId: state.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        project(
          ctx.query.viewport.pointer(pointer).world
        )
      }
    },
    move: (next) => {
      project(next.world)
    },
    up: () => {
      const commit = commitMindmapDrag(state)
      if (commit?.kind === 'root') {
        ctx.command.mindmap.moveRoot({
          nodeId: commit.nodeId,
          position: commit.position,
          origin: commit.origin
        })
      }

      if (commit?.kind === 'subtree') {
        ctx.command.mindmap.moveByDrop({
          id: commit.id,
          nodeId: commit.nodeId,
          drop: commit.drop,
          origin: commit.origin,
          nodeSize: ctx.config.mindmapNodeSize,
          layout: commit.layout
        })
      }

      return FINISH
    },
    cleanup: () => {
      ctx.local.feedback.mindmap.clear()
    }
  }
}
