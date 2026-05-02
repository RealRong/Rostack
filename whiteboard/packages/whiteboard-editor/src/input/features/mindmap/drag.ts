import { mindmap as mindmapApi,
  type MindmapDragState as CoreMindmapDragState,
  type MindmapLayoutSpec,
  type MindmapNodeId
} from '@whiteboard/core/mindmap'
import type { SelectionSummary } from '@whiteboard/core/selection'
import type { NodeId, Point } from '@whiteboard/core/types'
import { store } from '@shared/core'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { MindmapPreviewState } from '@whiteboard/editor/preview/types'
import type { EditorInputContext } from '@whiteboard/editor/input/runtime'
import type { Node } from '@whiteboard/core/types'

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
  mindmap: {
    tree: EditorInputContext['editor']['scene']['mindmaps']['tree']
  }
  node: (nodeId: NodeId) => Node | undefined
  selection: Pick<store.ReadStore<SelectionSummary>, 'get'>
}): MindmapDragState | undefined => {
  const pick = input.pointer.pick
  const pickedNode = pick.kind === 'node'
    ? input.node(pick.id)
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
  const treeView = treeId
    ? input.mindmap.tree(treeId)
    : undefined
  const locked = Boolean(
    (treeView
      ? input.node(treeView.rootId)?.locked
      : undefined)
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

  if (!treeView) {
    return undefined
  }
  const rootRect = treeView.computed.node[treeView.tree.rootNodeId]
  if (!rootRect) {
    return undefined
  }

  return nodeId === treeView.tree.rootNodeId
    ? mindmapApi.drop.createRootDrag({
        treeId,
        pointerId: input.pointer.pointerId,
        start: input.pointer.world,
        origin: {
          x: rootRect.x,
          y: rootRect.y
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
  mindmap: {
    tree: EditorInputContext['editor']['scene']['mindmaps']['tree']
  }
  node: (nodeId: NodeId) => Node | undefined
}): MindmapDragState | undefined => {
  const pickedNode = input.node(input.nodeId)
  const treeId = pickedNode?.owner?.kind === 'mindmap'
    ? pickedNode.owner.id
    : undefined
  const treeView = treeId
    ? input.mindmap.tree(treeId)
    : undefined
  const locked = Boolean(
    pickedNode?.locked
    || (treeView
      ? input.node(treeView.rootId)?.locked
      : undefined)
  )

  if (!pickedNode || !treeId || locked) {
    return undefined
  }

  if (!treeView) {
    return undefined
  }
  const rootRect = treeView.computed.node[treeView.tree.rootNodeId]
  if (!rootRect) {
    return undefined
  }

  return input.nodeId === treeView.tree.rootNodeId
    ? mindmapApi.drop.createRootDrag({
        treeId,
        pointerId: input.pointerId,
        start: input.world,
        origin: {
          x: rootRect.x,
          y: rootRect.y
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
  mindmap: {
    tree: EditorInputContext['editor']['scene']['mindmaps']['tree']
  }
}): MindmapDragState => mindmapApi.drop.projectDrag({
  active: input.state,
  world: input.world,
  treeView:
    input.state.kind === 'subtree'
      ? input.mindmap.tree(input.state.treeId)
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
  ctx: Pick<EditorInputContext, 'editor'>,
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
      mindmap: {
        tree: ctx.editor.scene.mindmaps.tree
      }
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
          ctx.editor.runtime.viewport.pointer(pointer).world
        )
      }
    },
    move: (next) => {
      project(next.world)
    },
    up: () => {
      const commit = commitMindmapDrag(state)

      if (commit?.kind === 'root') {
        ctx.editor.actions.mindmap.moveRoot({
          nodeId: commit.nodeId,
          position: commit.position,
          origin: commit.origin
        })
      }

      if (commit?.kind === 'subtree') {
        ctx.editor.actions.mindmap.moveByDrop({
          id: commit.id,
          nodeId: commit.nodeId,
          drop: commit.drop,
          origin: commit.origin,
          layout: commit.layout
        })
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}
