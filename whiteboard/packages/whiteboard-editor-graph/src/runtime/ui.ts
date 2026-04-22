import type {
  EdgeId,
  NodeModel,
  NodeId
} from '@whiteboard/core/types'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi } from '@whiteboard/core/selection'
import type {
  ChromeOverlay,
  ChromeView,
  EdgeView,
  NodeView,
  SelectionState,
  SelectionView,
  SessionInput
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'

export const readSelectionKind = (
  selection: SelectionState
): SelectionView['kind'] => {
  if (selection.nodeIds.length > 0 && selection.edgeIds.length > 0) {
    return 'mixed'
  }

  if (selection.nodeIds.length > 0) {
    return 'nodes'
  }

  if (selection.edgeIds.length > 0) {
    return 'edges'
  }

  return 'none'
}

const readSelectionRole = (
  node: NodeModel
): 'content' | 'frame' => node.type === 'frame'
  ? 'frame'
  : 'content'

const readSelectionTransformCapability = (
  node: NodeModel
) => node.type === 'frame' || node.type === 'draw'
  ? {
      resize: false,
      rotate: false
    }
  : {
      resize: true,
      rotate: true
    }

const readSelectionNodeTransformBehavior = (
  node: NodeModel
) => nodeApi.transform.resolveBehavior(node, {
  role: readSelectionRole(node),
  resize: readSelectionTransformCapability(node).resize
})

const toSelectionKind = (
  kind: 'none' | 'node' | 'nodes' | 'edge' | 'edges' | 'mixed'
): SelectionView['kind'] => (
  kind === 'node'
    ? 'nodes'
    : kind === 'edge'
      ? 'edges'
      : kind
)

export const buildSelectionView = (input: {
  selection: SelectionState
  nodes: ReadonlyMap<NodeId, NodeView>
  edges: ReadonlyMap<EdgeId, EdgeView>
}): SelectionView => {
  const selectedNodes = input.selection.nodeIds.flatMap((nodeId) => {
    const node = input.nodes.get(nodeId)?.base.node
    return node ? [node] : []
  })
  const selectedEdges = input.selection.edgeIds.flatMap((edgeId) => {
    const edge = input.edges.get(edgeId)?.base.edge
    return edge ? [edge] : []
  })
  const summary = selectionApi.derive.summary({
    target: input.selection,
    nodes: selectedNodes,
    edges: selectedEdges,
    readNodeRect: (node) => input.nodes.get(node.id)?.layout.bounds,
    readEdgeBounds: (edge) => input.edges.get(edge.id)?.route.bounds,
    resolveNodeTransformBehavior: readSelectionNodeTransformBehavior
  })
  const affordance = selectionApi.derive.affordance({
    selection: summary,
    resolveNodeRole: readSelectionRole,
    resolveNodeTransformCapability: readSelectionTransformCapability
  })

  return {
    target: input.selection,
    kind: toSelectionKind(summary.kind),
    summary: {
      box: summary.box,
      count: summary.items.count,
      nodeCount: summary.items.nodeCount,
      edgeCount: summary.items.edgeCount,
      groupIds: summary.target.groupIds
    },
    affordance: {
      owner: affordance.owner,
      ownerNodeId: affordance.ownerNodeId,
      displayBox: affordance.displayBox,
      moveHit: affordance.moveHit,
      canMove: affordance.canMove,
      canResize: affordance.canResize,
      canRotate: affordance.canRotate,
      handles: affordance.transformPlan?.handles ?? []
    }
  }
}

export const buildChromeView = (input: {
  session: SessionInput
  selection: SelectionState
  hover: WorkingState['ui']['hover']
}): ChromeView => {
  const overlays: ChromeOverlay[] = []

  if (input.hover.kind !== 'none') {
    overlays.push({
      kind: 'hover'
    })
  }

  if (
    input.selection.nodeIds.length > 0
    || input.selection.edgeIds.length > 0
  ) {
    overlays.push({
      kind: 'selection'
    })
  }

  if (input.session.preview.selection.guides.length > 0) {
    overlays.push({
      kind: 'guide'
    })
  }

  if (input.session.preview.selection.marquee) {
    overlays.push({
      kind: 'marquee'
    })
  }

  if (input.session.preview.draw) {
    overlays.push({
      kind: 'draw'
    })
  }

  if (input.session.edit) {
    overlays.push({
      kind: 'edit'
    })
  }

  if (
    input.session.preview.mindmap?.rootMove
    || input.session.preview.mindmap?.subtreeMove
  ) {
    overlays.push({
      kind: 'mindmap-drop'
    })
  }

  return {
    overlays,
    hover: input.hover,
    preview: {
      marquee: input.session.preview.selection.marquee,
      guides: input.session.preview.selection.guides,
      draw: input.session.preview.draw,
      mindmap: input.session.preview.mindmap
    },
    edit: input.session.edit
  }
}
