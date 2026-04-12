import {
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag,
  type MindmapDragState as CoreMindmapDragState
} from '@whiteboard/core/mindmap'
import type { Point } from '@whiteboard/core/types'
import type {
  InteractionBinding,
  InteractionSession
} from '../runtime/interaction/types'
import { FINISH } from '../runtime/interaction/result'
import type { InteractionContext } from './context'
import type { MindmapDragFeedback } from '../runtime/overlay'
import type { PointerDownInput } from '../types/input'

const toMindmapDragFeedback = (
  state: CoreMindmapDragState
): MindmapDragFeedback => {
  if (state.kind === 'root') {
    return {
      treeId: state.treeId,
      kind: 'root',
      baseOffset: state.position
    }
  }

  return {
    treeId: state.treeId,
    kind: 'subtree',
    baseOffset: state.baseOffset,
    preview: {
      nodeId: state.nodeId,
      ghost: state.ghost,
      drop: state.drop
    }
  }
}

const resolveMindmapDragState = (
  ctx: InteractionContext,
  input: PointerDownInput
): CoreMindmapDragState | null => {
  const tool = ctx.read.tool.get()

  if (
    tool.type !== 'select'
    || input.pick.kind !== 'mindmap'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  const treeView = ctx.read.mindmap.snapshot.get(input.pick.treeId)
  const rootPosition = ctx.read.mindmap.rootPosition.get(input.pick.treeId)
  if (!treeView || !rootPosition) {
    return null
  }

  const baseOffset = {
    x: rootPosition.x,
    y: rootPosition.y
  }

  return input.pick.nodeId === treeView.tree.rootId
    ? createRootDrag({
        treeId: input.pick.treeId,
        pointerId: input.pointerId,
        start: input.world,
        origin: baseOffset
      })
    : createSubtreeDrag({
        treeId: input.pick.treeId,
        treeView,
        nodeId: input.pick.nodeId,
        pointerId: input.pointerId,
        world: input.world,
        baseOffset
      }) ?? null
}

const projectMindmapState = (input: {
  ctx: InteractionContext
  state: CoreMindmapDragState
  world: Point
}): CoreMindmapDragState => projectMindmapDrag({
  active: input.state,
  world: input.world,
  treeView:
    input.state.kind === 'subtree'
      ? input.ctx.read.mindmap.snapshot.get(input.state.treeId)
      : undefined
})

const commitMindmapDrag = (
  ctx: InteractionContext,
  state: CoreMindmapDragState
) => {
  if (state.kind === 'root') {
    ctx.write.mindmap.moveRoot({
      nodeId: state.treeId,
      position: state.position,
      origin: state.origin
    })
    return
  }

  if (!state.drop) {
    return
  }

  ctx.write.mindmap.moveByDrop({
    id: state.treeId,
    nodeId: state.nodeId,
    drop: {
      parentId: state.drop.parentId,
      index: state.drop.index,
      side: state.drop.side
    },
    origin: {
      parentId: state.originParentId,
      index: state.originIndex
    },
    nodeSize: ctx.config.mindmapNodeSize,
    layout: state.layout
  })
}

const createMindmapSession = (
  ctx: InteractionContext,
  initial: CoreMindmapDragState
): InteractionSession => {
  let state = initial
  ctx.write.preview.mindmap.setDrag(toMindmapDragFeedback(state))

  return {
    mode: 'mindmap-drag',
    pointerId: state.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        state = projectMindmapState(
          {
            ctx,
            state,
            world: ctx.read.viewport.pointer(pointer).world
          }
        )
        ctx.write.preview.mindmap.setDrag(toMindmapDragFeedback(state))
      }
    },
    move: (next) => {
      state = projectMindmapState({
        ctx,
        state,
        world: next.world
      })
      ctx.write.preview.mindmap.setDrag(toMindmapDragFeedback(state))
    },
    up: () => {
      commitMindmapDrag(ctx, state)
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
    const state = resolveMindmapDragState(ctx, input)
    return state
      ? createMindmapSession(ctx, state)
      : null
  }
})
