import {
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag,
  type MindmapDragState as CoreMindmapDragState,
  type MindmapLayoutSpec,
  type MindmapNodeId
} from '@whiteboard/core/mindmap'
import type { NodeId, Point } from '@whiteboard/core/types'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { MindmapDragFeedback } from '@whiteboard/editor/local/feedback'
import type { MindmapPresentationRead } from '@whiteboard/editor/query/mindmap/read'
import type { NodePresentationRead } from '@whiteboard/editor/query/node/read'
import type { SelectionModelRead } from '@whiteboard/editor/query/selection/model'

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
      layout: MindmapLayoutSpec
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
  mindmap: Pick<MindmapPresentationRead, 'item'>
  node: Pick<NodePresentationRead, 'item'>
  selection: Pick<SelectionModelRead, 'get'>
}): MindmapDragState | undefined => {
  const pick = input.pointer.pick
  const pickedNode = pick.kind === 'node'
    ? input.node.item.get(pick.id)?.node
    : undefined
  const treeId = pick.kind === 'mindmap'
    ? pick.treeId
    : pickedNode?.mindmapId
  const nodeId = pick.kind === 'mindmap'
    ? pick.nodeId
    : pick.kind === 'node' && pick.part !== 'field'
      ? pick.id
      : undefined
  const locked = Boolean(
    (treeId ? input.node.item.get(treeId)?.node.locked : undefined)
    || pickedNode?.locked
  )
  const selectedNodeIds = input.selection.get().summary.target.nodeIds
  const selected = Boolean(nodeId && selectedNodeIds.includes(nodeId))

  if (
    input.tool.type !== 'select'
    || !treeId
    || !nodeId
    || !selected
    || locked
    || input.pointer.editable
    || input.pointer.ignoreInput
    || input.pointer.ignoreSelection
  ) {
    return undefined
  }

  const treeView = input.mindmap.item.get(treeId)
  if (!treeView) {
    return undefined
  }

  const baseOffset = {
    x: treeView.node.position.x,
    y: treeView.node.position.y
  }

  return nodeId === treeView.tree.rootNodeId
    ? createRootDrag({
        treeId,
        pointerId: input.pointer.pointerId,
        start: input.pointer.world,
        origin: baseOffset
      })
    : createSubtreeDrag({
        treeId,
        treeView,
        nodeId,
        pointerId: input.pointer.pointerId,
        world: input.pointer.world,
        baseOffset
      })
}

export const startMindmapDragForNode = (input: {
  nodeId: NodeId
  pointerId: number
  world: Point
  mindmap: Pick<MindmapPresentationRead, 'item'>
  node: Pick<NodePresentationRead, 'item'>
}): MindmapDragState | undefined => {
  const pickedNode = input.node.item.get(input.nodeId)?.node
  const treeId = pickedNode?.mindmapId
  const locked = Boolean(
    pickedNode?.locked
    || (treeId ? input.node.item.get(treeId)?.node.locked : undefined)
  )

  if (!pickedNode || !treeId || locked) {
    return undefined
  }

  const treeView = input.mindmap.item.get(treeId)
  if (!treeView) {
    return undefined
  }

  const baseOffset = {
    x: treeView.node.position.x,
    y: treeView.node.position.y
  }

  return input.nodeId === treeView.tree.rootNodeId
    ? createRootDrag({
        treeId,
        pointerId: input.pointerId,
        start: input.world,
        origin: baseOffset
      })
    : createSubtreeDrag({
        treeId,
        treeView,
        nodeId: input.nodeId,
        pointerId: input.pointerId,
        world: input.world,
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
