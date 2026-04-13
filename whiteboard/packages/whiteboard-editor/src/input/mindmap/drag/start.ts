import {
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag,
  type MindmapDragState as CoreMindmapDragState,
  type MindmapLayoutConfig,
  type MindmapNodeId
} from '@whiteboard/core/mindmap'
import type { NodeId, Point } from '@whiteboard/core/types'
import type { PointerDownInput } from '../../../types/input'
import type { Tool } from '../../../types/tool'
import type { MindmapDragFeedback } from '../../../local/feedback'
import type { MindmapPresentationRead } from '../../../query/mindmap/read'

export type MindmapDragState = CoreMindmapDragState

export type MindmapDragCommit =
  | {
      kind: 'root'
      nodeId: NodeId
      position: Point
      origin?: Point
    }
  | {
      kind: 'subtree'
      id: NodeId
      nodeId: MindmapNodeId
      drop: {
        parentId: MindmapNodeId
        index: number
        side?: 'left' | 'right'
      }
      origin: {
        parentId?: MindmapNodeId
        index?: number
      }
      layout: MindmapLayoutConfig
    }

export const previewMindmapDrag = (
  state: MindmapDragState
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

export const startMindmapDrag = (input: {
  tool: Tool
  pointer: PointerDownInput
  mindmap: Pick<MindmapPresentationRead, 'item' | 'rootPosition'>
}): MindmapDragState | undefined => {
  if (
    input.tool.type !== 'select'
    || input.pointer.pick.kind !== 'mindmap'
    || input.pointer.editable
    || input.pointer.ignoreInput
    || input.pointer.ignoreSelection
  ) {
    return undefined
  }

  const treeView = input.mindmap.item.get(input.pointer.pick.treeId)
  const rootPosition = input.mindmap.rootPosition.get(input.pointer.pick.treeId)
  if (!treeView || !rootPosition) {
    return undefined
  }

  const baseOffset = {
    x: rootPosition.x,
    y: rootPosition.y
  }

  return input.pointer.pick.nodeId === treeView.tree.rootId
    ? createRootDrag({
        treeId: input.pointer.pick.treeId,
        pointerId: input.pointer.pointerId,
        start: input.pointer.world,
        origin: baseOffset
      })
    : createSubtreeDrag({
        treeId: input.pointer.pick.treeId,
        treeView,
        nodeId: input.pointer.pick.nodeId,
        pointerId: input.pointer.pointerId,
        world: input.pointer.world,
        baseOffset
      })
}

export const stepMindmapDrag = (input: {
  state: MindmapDragState
  world: Point
  mindmap: Pick<MindmapPresentationRead, 'item'>
}): MindmapDragState => projectMindmapDrag({
  active: input.state,
  world: input.world,
  treeView:
    input.state.kind === 'subtree'
      ? input.mindmap.item.get(input.state.treeId)
      : undefined
})

export const commitMindmapDrag = (
  state: MindmapDragState
): MindmapDragCommit | undefined => {
  if (state.kind === 'root') {
    return {
      kind: 'root',
      nodeId: state.treeId,
      position: state.position,
      origin: state.origin
    }
  }

  if (!state.drop) {
    return undefined
  }

  return {
    kind: 'subtree',
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
    layout: state.layout
  }
}
