import {
  selection as selectionApi,
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget
} from '@whiteboard/core/selection'
import {
  node as nodeApi,
  type SelectionTransformHandlePlan
} from '@whiteboard/core/node'
import { equal, store } from '@shared/core'
import type { EdgeId, NodeId } from '@whiteboard/core/types'
import type {
  EditorSelectionAffordanceView,
  EditorSelectionSummaryView,
  EditorSelectionView,
  SelectionMembers
} from '@whiteboard/editor/types/selectionPresentation'
import type { GraphEdgeRead } from './edge'
import type { GraphNodeRead } from './node'

export type GraphSelectionRead = {
  view: store.ReadStore<EditorSelectionView>
  members: store.ReadStore<SelectionMembers>
  summary: store.ReadStore<SelectionSummary>
  affordance: store.ReadStore<SelectionAffordance>
  node: {
    selected: store.KeyedReadStore<NodeId, boolean>
  }
  edge: {
    selected: store.KeyedReadStore<EdgeId, boolean>
  }
}

const EMPTY_SELECTED_NODES = new Map<NodeId, boolean>()
const EMPTY_SELECTED_EDGES = new Map<EdgeId, boolean>()
const EMPTY_SELECTION_HANDLES: readonly SelectionTransformHandlePlan[] = []

const isSelectionMembersEqual = (
  left: SelectionMembers,
  right: SelectionMembers
) => (
  left.key === right.key
  && selectionApi.target.equal(left.target, right.target)
  && equal.sameOrder(left.nodes, right.nodes)
  && equal.sameOrder(left.edges, right.edges)
  && left.primaryNode === right.primaryNode
  && left.primaryEdge === right.primaryEdge
)

const isSelectionSummaryViewEqual = (
  left: EditorSelectionSummaryView,
  right: EditorSelectionSummaryView
) => (
  left.count === right.count
  && left.nodeCount === right.nodeCount
  && left.edgeCount === right.edgeCount
  && left.groupIds === right.groupIds
  && equal.sameOptionalRect(left.box, right.box)
)

const isSelectionHandleEqual = (
  left: SelectionTransformHandlePlan,
  right: SelectionTransformHandlePlan
) => (
  left.id === right.id
  && left.visible === right.visible
  && left.enabled === right.enabled
  && left.family === right.family
  && left.cursor === right.cursor
)

const isSelectionAffordanceViewEqual = (
  left: EditorSelectionAffordanceView,
  right: EditorSelectionAffordanceView
) => (
  left.owner === right.owner
  && left.ownerNodeId === right.ownerNodeId
  && left.moveHit === right.moveHit
  && left.canMove === right.canMove
  && left.canResize === right.canResize
  && left.canRotate === right.canRotate
  && left.handles === right.handles
  && equal.sameOptionalRect(left.displayBox, right.displayBox)
  && equal.sameOrder(left.handles, right.handles, isSelectionHandleEqual)
)

const readSelectionMembersKey = (
  target: SelectionTarget
) => `${target.nodeIds.join('\0')}\u0001${target.edgeIds.join('\0')}`

const readNodeTransformCapability = (
  node: Pick<GraphNodeRead, 'capability'>,
  entry: SelectionMembers['nodes'][number]
) => {
  const capability = node.capability(entry)

  return {
    resize: capability.resize,
    rotate: capability.rotate
  }
}

const toSelectionViewKind = (
  kind: SelectionSummary['kind']
): EditorSelectionView['kind'] => (
  kind === 'node'
    ? 'nodes'
    : kind === 'edge'
      ? 'edges'
      : kind
)

export const createGraphSelectionRead = ({
  source,
  node,
  edge
}: {
  source: store.ReadStore<SelectionTarget>
  node: GraphNodeRead
  edge: Pick<GraphEdgeRead, 'edges' | 'bounds'>
}): GraphSelectionRead => {
  const members = store.createDerivedStore<SelectionMembers>({
    get: () => {
      const target = store.read(source)
      const nodes = node.nodes(target.nodeIds)
      const edges = edge.edges(target.edgeIds)

      return {
        key: readSelectionMembersKey(target),
        target,
        nodes,
        edges,
        primaryNode: nodes[0],
        primaryEdge: edges[0]
      }
    },
    isEqual: isSelectionMembersEqual
  })

  const summary = store.createDerivedStore<SelectionSummary>({
    get: () => {
      const current = store.read(members)

      return selectionApi.derive.summary({
        target: current.target,
        nodes: current.nodes,
        edges: current.edges,
        readNodeRect: (entry) => store.read(node.view, entry.id)?.rect,
        readEdgeBounds: (entry) => store.read(edge.bounds, entry.id),
        resolveNodeTransformBehavior: (entry) => nodeApi.transform.resolveBehavior(entry, {
          role: node.capability(entry).role,
          resize: node.capability(entry).resize
        })
      })
    },
    isEqual: selectionApi.derive.isSummaryEqual
  })

  const affordance = store.createDerivedStore<SelectionAffordance>({
    get: () => selectionApi.derive.affordance({
      selection: store.read(summary),
      resolveNodeRole: (entry) => node.capability(entry).role,
      resolveNodeTransformCapability: (entry) => readNodeTransformCapability(node, entry)
    }),
    isEqual: selectionApi.derive.isAffordanceEqual
  })

  const viewSummary = store.createDerivedStore<EditorSelectionSummaryView>({
    get: () => {
      const current = store.read(summary)

      return {
        box: current.box,
        count: current.items.count,
        nodeCount: current.items.nodeCount,
        edgeCount: current.items.edgeCount,
        groupIds: current.target.groupIds
      }
    },
    isEqual: isSelectionSummaryViewEqual
  })

  const viewAffordance = store.createDerivedStore<EditorSelectionAffordanceView>({
    get: () => {
      const current = store.read(affordance)

      return {
        owner: current.owner,
        ownerNodeId: current.ownerNodeId,
        displayBox: current.displayBox,
        moveHit: current.moveHit,
        canMove: current.canMove,
        canResize: current.canResize,
        canRotate: current.canRotate,
        handles: current.transformPlan?.handles ?? EMPTY_SELECTION_HANDLES
      }
    },
    isEqual: isSelectionAffordanceViewEqual
  })

  const view = store.createStructStore<EditorSelectionView>({
    fields: {
      target: {
        get: () => store.read(source),
        isEqual: selectionApi.target.equal
      },
      kind: {
        get: () => toSelectionViewKind(store.read(summary).kind)
      },
      summary: {
        get: () => store.read(viewSummary)
      },
      affordance: {
        get: () => store.read(viewAffordance)
      }
    }
  })

  return {
    view,
    members,
    summary,
    affordance,
    node: {
      selected: store.createProjectedKeyedStore({
        source,
        select: (target) => (
          target.nodeIds.length > 0
            ? new Map(target.nodeIds.map((nodeId) => [nodeId, true] as const))
            : EMPTY_SELECTED_NODES
        ),
        emptyValue: false
      })
    },
    edge: {
      selected: store.createProjectedKeyedStore({
        source,
        select: (target) => (
          target.edgeIds.length > 0
            ? new Map(target.edgeIds.map((edgeId) => [edgeId, true] as const))
            : EMPTY_SELECTED_EDGES
        ),
        emptyValue: false
      })
    }
  }
}
