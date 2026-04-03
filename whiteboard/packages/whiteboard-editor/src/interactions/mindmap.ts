import {
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag,
  type MindmapDragSession as CoreMindmapDragState
} from '@whiteboard/core/mindmap'
import type { Point } from '@whiteboard/core/types'
import type {
  InteractionBinding,
  InteractionSession
} from '../runtime/interaction'
import type { InteractionCtx } from '../runtime/interaction'
import type { MindmapDragFeedback } from '../runtime/overlay'
import type { PointerDownInput } from '../types/input'

type MindmapInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config'
>

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
  ctx: MindmapInteractionCtx,
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

  const treeView = ctx.read.mindmap.item.get(input.pick.treeId)
  if (!treeView) {
    return null
  }

  const position = treeView.node.position
  if (!position) {
    return null
  }

  const baseOffset = {
    x: position.x,
    y: position.y
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
  ctx: MindmapInteractionCtx
  state: CoreMindmapDragState
  world: Point
}): CoreMindmapDragState => projectMindmapDrag({
  active: input.state,
  world: input.world,
  treeView:
    input.state.kind === 'subtree'
      ? input.ctx.read.mindmap.item.get(input.state.treeId)
      : undefined
})

const commitMindmapDrag = (
  ctx: MindmapInteractionCtx,
  state: CoreMindmapDragState
) => {
  if (state.kind === 'root') {
    ctx.write.document.mindmap.moveRoot({
      nodeId: state.treeId,
      position: state.position,
      origin: state.origin
    })
    return
  }

  if (!state.drop) {
    return
  }

  ctx.write.document.mindmap.moveByDrop({
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
  ctx: MindmapInteractionCtx,
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
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {
      ctx.write.preview.mindmap.clear()
    }
  }
}

export const createMindmapInteraction = (
  ctx: MindmapInteractionCtx
): InteractionBinding => ({
  key: 'mindmap',
  start: (input) => {
    const state = resolveMindmapDragState(ctx, input)
    return state
      ? createMindmapSession(ctx, state)
      : null
  }
})
