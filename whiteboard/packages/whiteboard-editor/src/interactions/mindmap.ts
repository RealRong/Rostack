import type {
  InteractionBinding,
  InteractionSession
} from '../runtime/interaction/types'
import { FINISH } from '../runtime/interaction/result'
import type { InteractionContext } from './context'
import {
  commitMindmapDrag,
  previewMindmapDrag,
  startMindmapDrag,
  stepMindmapDrag,
  type MindmapDragState
} from '../runtime/mindmap/drag'

const applyMindmapPreview = (
  ctx: InteractionContext,
  state: MindmapDragState
) => {
  ctx.write.preview.mindmap.setDrag(
    previewMindmapDrag(state)
  )
}

const createMindmapSession = (
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
      mindmap: ctx.read.mindmap
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
          ctx.read.viewport.pointer(pointer).world
        )
      }
    },
    move: (next) => {
      project(next.world)
    },
    up: () => {
      const commit = commitMindmapDrag(state)
      if (commit?.kind === 'root') {
        ctx.write.mindmap.moveRoot({
          nodeId: commit.nodeId,
          position: commit.position,
          origin: commit.origin
        })
      }

      if (commit?.kind === 'subtree') {
        ctx.write.mindmap.moveByDrop({
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
      ctx.write.preview.mindmap.clear()
    }
  }
}

export const createMindmapInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'mindmap',
  start: (input) => {
    const state = startMindmapDrag({
      tool: ctx.read.tool.get(),
      pointer: input,
      mindmap: ctx.read.mindmap
    })

    return state
      ? createMindmapSession(ctx, state)
      : null
  }
})
