import {
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag,
  type MindmapDragSession
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
  session: MindmapDragSession
): MindmapDragFeedback => {
  if (session.kind === 'root') {
    return {
      treeId: session.treeId,
      kind: 'root',
      baseOffset: session.position
    }
  }

  return {
    treeId: session.treeId,
    kind: 'subtree',
    baseOffset: session.baseOffset,
    preview: {
      nodeId: session.nodeId,
      ghost: session.ghost,
      drop: session.drop
    }
  }
}

const resolveMindmapDragSession = (
  ctx: MindmapInteractionCtx,
  input: PointerDownInput
): MindmapDragSession | null => {
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

const projectMindmapSession = (input: {
  ctx: MindmapInteractionCtx
  state: MindmapDragSession
  world: Point
}): MindmapDragSession => projectMindmapDrag({
  active: input.state,
  world: input.world,
  treeView:
    input.state.kind === 'subtree'
      ? input.ctx.read.mindmap.item.get(input.state.treeId)
      : undefined
})

const commitMindmapDrag = (
  ctx: MindmapInteractionCtx,
  state: MindmapDragSession
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
  initial: MindmapDragSession
): InteractionSession => {
  let session = initial
  ctx.write.preview.mindmap.setDrag(toMindmapDragFeedback(session))

  return {
    mode: 'mindmap-drag',
    pointerId: session.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        session = projectMindmapSession(
          {
            ctx,
            state: session,
            world: ctx.read.viewport.pointer(pointer).world
          }
        )
        ctx.write.preview.mindmap.setDrag(toMindmapDragFeedback(session))
      }
    },
    move: (next) => {
      session = projectMindmapSession({
        ctx,
        state: session,
        world: next.world
      })
      ctx.write.preview.mindmap.setDrag(toMindmapDragFeedback(session))
    },
    up: () => {
      commitMindmapDrag(ctx, session)
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
    const state = resolveMindmapDragSession(ctx, input)
    return state
      ? createMindmapSession(ctx, state)
      : null
  }
})
