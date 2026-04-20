import { mindmap as mindmapApi,
  type MindmapDragState as CoreMindmapDragState,
  type MindmapLayoutSpec,
  type MindmapNodeId
} from '@whiteboard/core/mindmap'
import type { SelectionSummary } from '@whiteboard/core/selection'
import type { NodeId, Point } from '@whiteboard/core/types'
import type { ReadStore } from '@shared/core'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { MindmapPreviewState } from '@whiteboard/editor/session/preview'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import type { MindmapPresentationRead } from '@whiteboard/editor/query/mindmap/read'
import type { NodePresentationRead } from '@whiteboard/editor/query/node/read'

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

const previewMindmapDrag = (
  state: MindmapDragState
): MindmapPreviewState => {
  if (state.kind === 'root') {
    return {
      rootMove: {
        treeId: state.treeId,
        delta: {
          x: state.position.x - state.origin.x,
          y: state.position.y - state.origin.y
        }
      }
    }
  }

  return {
    subtreeMove: {
      treeId: state.treeId,
      nodeId: state.nodeId,
      ghost: state.ghost,
      drop: state.drop
    }
  }
}

export const tryStartMindmapDrag = (input: {
  tool: Tool
  pointer: PointerDownInput
  mindmap: Pick<MindmapPresentationRead, 'item'>
  node: Pick<NodePresentationRead, 'item'>
  selection: Pick<ReadStore<SelectionSummary>, 'get'>
}): MindmapDragState | undefined => {
  const pick = input.pointer.pick
  const pickedNode = pick.kind === 'node'
    ? input.node.item.get(pick.id)?.node
    : undefined
  const treeId = pick.kind === 'mindmap'
    ? pick.treeId
    : pickedNode?.owner?.kind === 'mindmap'
      ? pickedNode.owner.id
      : undefined
  const nodeId = pick.kind === 'mindmap'
    ? pick.nodeId
    : pick.kind === 'node' && pick.part !== 'field'
      ? pick.id
      : undefined
  const locked = Boolean(
    (treeId ? input.node.item.get(treeId)?.node.locked : undefined)
    || pickedNode?.locked
  )
  const selectedNodeIds = input.selection.get().target.nodeIds
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

  return nodeId === treeView.tree.rootNodeId
    ? mindmapApi.drop.createRootDrag({
        treeId,
        pointerId: input.pointer.pointerId,
        start: input.pointer.world,
        origin: {
          x: treeView.node.position.x,
          y: treeView.node.position.y
        }
      })
    : mindmapApi.drop.createSubtreeDrag({
        treeId,
        treeView,
        nodeId,
        pointerId: input.pointer.pointerId,
        world: input.pointer.world
      })
}

export const tryStartMindmapDragForNode = (input: {
  nodeId: NodeId
  pointerId: number
  world: Point
  mindmap: Pick<MindmapPresentationRead, 'item'>
  node: Pick<NodePresentationRead, 'item'>
}): MindmapDragState | undefined => {
  const pickedNode = input.node.item.get(input.nodeId)?.node
  const treeId = pickedNode?.owner?.kind === 'mindmap'
    ? pickedNode.owner.id
    : undefined
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

  return input.nodeId === treeView.tree.rootNodeId
    ? mindmapApi.drop.createRootDrag({
        treeId,
        pointerId: input.pointerId,
        start: input.world,
        origin: {
          x: treeView.node.position.x,
          y: treeView.node.position.y
        }
      })
    : mindmapApi.drop.createSubtreeDrag({
        treeId,
        treeView,
        nodeId: input.nodeId,
        pointerId: input.pointerId,
        world: input.world
      })
}

const stepMindmapDrag = (input: {
  state: MindmapDragState
  world: Point
  mindmap: Pick<MindmapPresentationRead, 'item'>
}): MindmapDragState => mindmapApi.drop.projectDrag({
  active: input.state,
  world: input.world,
  treeView:
    input.state.kind === 'subtree'
      ? input.mindmap.item.get(input.state.treeId)
      : undefined
})

const commitMindmapDrag = (
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

export const createMindmapDragSession = (
  ctx: Pick<EditorHostDeps, 'query' | 'write'>,
  initial: MindmapDragState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

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
    interaction!.gesture = createGesture('mindmap-drag', {
      mindmap: previewMindmapDrag(state)
    })
  }

  interaction = {
    mode: 'mindmap-drag',
    pointerId: state.pointerId,
    chrome: false,
    gesture: createGesture('mindmap-drag', {
      mindmap: previewMindmapDrag(state)
    }),
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
        ctx.write.mindmap.root.move(commit.nodeId, commit.position)
      }

      if (commit?.kind === 'subtree') {
        ctx.write.mindmap.topic.move(commit.id, {
          nodeId: commit.nodeId,
          parentId: commit.drop.parentId,
          index: commit.drop.index,
          side: commit.drop.side
        })
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
