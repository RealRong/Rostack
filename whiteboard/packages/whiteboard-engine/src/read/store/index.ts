import type { ReadModel } from '@whiteboard/engine/types/read'
import type { EngineDocument, EngineRead, EngineReadIndex } from '@whiteboard/engine/types/instance'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type { BoardConfig } from '@whiteboard/core/config'
import {
  getEdgePath,
  getEdgePathBounds,
  matchEdgeRect
} from '@whiteboard/core/edge'
import {
  getRectsBoundingRect
} from '@whiteboard/core/geometry'
import {
  exportSliceFromSelection,
  exportSliceFromEdge,
  exportSliceFromNodes,
  listCanvasItemRefs,
  listGroupCanvasItemRefs,
  listGroupEdgeIds,
  listGroupNodeIds,
  listGroups
} from '@whiteboard/core/document'
import {
  collectFrameMembers,
  filterNodeIdsInRect,
  readNodeRotation,
  resolveFrameAtPoint,
  resolveNodeFrame,
  matchCanvasNodeRect
} from '@whiteboard/core/node'
import {
  getTargetBounds,
  type SelectionTarget
} from '@whiteboard/core/selection'
import {
  type CanvasItemRef,
  type Edge,
  type EdgeId,
  type Node,
  type NodeId,
  type Point,
  type Rect
} from '@whiteboard/core/types'
import { createValueStore, presentValues } from '@shared/core'
import { DEFAULT_TUNING } from '@whiteboard/engine/config'
import { RESET_READ_IMPACT } from '@whiteboard/engine/read/impacts'
import { EdgeRectIndex, NodeRectIndex, SnapIndex } from '@whiteboard/engine/read/indexes'
import { createEdgeProjection } from '@whiteboard/engine/read/store/edge'
import { createReadModel } from '@whiteboard/engine/read/store/model'
import { createMindmapProjection } from '@whiteboard/engine/read/store/mindmap'
import { createNodeProjection } from '@whiteboard/engine/read/store/node'
import type { ReadSnapshot } from '@whiteboard/engine/types/internal/read'
import {
  resolveGroupTarget,
  resolveTargetBounds
} from '@whiteboard/engine/read/store/target'

const EMPTY_GROUP_IDS: readonly string[] = []

export const createRead = ({
  document,
  config
}: {
  document: EngineDocument
  config: BoardConfig
}): {
  read: EngineRead
  invalidate: (impact: KernelReadImpact) => void
} => {
  const readDocument = document.get
  const readModel = createReadModel({ readDocument })

  const nodeRectIndex = new NodeRectIndex(config)
  const edgeRectIndex = new EdgeRectIndex(
    Math.max(
      config.node.snapGridCellSize,
      config.node.groupPadding * DEFAULT_TUNING.query.snapGridPaddingFactor
    )
  )
  const snapIndex = new SnapIndex(
    Math.max(
      config.node.snapGridCellSize,
      config.node.groupPadding * DEFAULT_TUNING.query.snapGridPaddingFactor
    )
  )
  const index: EngineReadIndex = {
    node: {
      all: nodeRectIndex.all,
      get: nodeRectIndex.byId,
      idsInRect: nodeRectIndex.nodeIdsInRect
    },
    edge: {
      idsInRect: edgeRectIndex.idsInRect
    },
    snap: {
      all: snapIndex.all,
      inRect: snapIndex.queryInRect
    }
  }

  const createSnapshot = (model: ReadModel): ReadSnapshot => ({
    model,
    index
  })
  const background = createValueStore(readDocument().background)
  const scene = createValueStore(
    listCanvasItemRefs(readDocument()) as readonly CanvasItemRef[]
  )

  const syncIndexes = (impact: KernelReadImpact, model: ReadModel) => {
    nodeRectIndex.applyChange(impact, model)
    snapIndex.applyChange(impact, {
      all: nodeRectIndex.all,
      get: nodeRectIndex.byId
    }, nodeRectIndex.changedIds())
  }

  const initialModel = readModel()
  syncIndexes(RESET_READ_IMPACT, initialModel)
  const initialSnapshot = createSnapshot(initialModel)

  const nodeProjection = createNodeProjection(initialSnapshot)
  const edgeProjection = createEdgeProjection(initialSnapshot)
  const mindmapProjection = createMindmapProjection(initialSnapshot, {
    config,
  })

  const readCanvasNode = (
    nodeId: NodeId
  ) => index.node.get(nodeId)

  const readProjectedNodeGeometry = (nodeId: NodeId) =>
    readCanvasNode(nodeId)?.geometry

  const readProjectedNodeRect = (nodeId: NodeId): Rect | undefined =>
    readProjectedNodeGeometry(nodeId)?.rect

  const readProjectedNodeBounds = (nodeId: NodeId): Rect | undefined =>
    readProjectedNodeGeometry(nodeId)?.bounds

  const readNodes: EngineRead['node']['nodes'] = (
    nodeIds
  ) => presentValues(nodeIds, (nodeId) => nodeProjection.item.get(nodeId)?.node)

  const readEdges: EngineRead['edge']['edges'] = (
    edgeIds
  ) => presentValues(edgeIds, (edgeId) => edgeProjection.item.get(edgeId)?.edge)

  const readOrderedNodes = (): Node[] => [...readNodes(nodeProjection.list.get())]

  const readFrameRect = (
    frameId: NodeId
  ): Rect | undefined => {
    const entry = index.node.get(frameId)
    return entry?.node.type === 'frame'
      ? entry.geometry.rect
      : undefined
  }

  const readFrameNodeAtPoint = (
    point: Point
  ): NodeId | undefined => resolveFrameAtPoint({
    nodes: readOrderedNodes(),
    point,
    getFrameRect: (node) => readFrameRect(node.id)
  })

  const readNodeFrameId = (
    nodeId: NodeId
  ): NodeId | undefined => resolveNodeFrame({
    nodes: readOrderedNodes(),
    nodeId,
    getNodeRect: (node) => readProjectedNodeBounds(node.id),
    getFrameRect: (node) => readFrameRect(node.id)
  })

  const readFrameMembers = (
    frameId: NodeId,
    options?: {
      deep?: boolean
    }
  ): readonly NodeId[] => collectFrameMembers({
    nodes: readOrderedNodes(),
    frameId,
    deep: options?.deep,
    getNodeRect: (node) => readProjectedNodeBounds(node.id),
    getFrameRect: (node) => readFrameRect(node.id)
  })

  const readNodeIdsInRect = (
    rect: Rect,
    options?: Parameters<typeof index.node.idsInRect>[1]
  ): NodeId[] => {
    const match = options?.match ?? 'touch'
    const policy = options?.policy ?? 'default'
    const candidateIds = index.node.idsInRect(rect, {
      ...options,
      match: match === 'contain' ? 'touch' : match
    })
    return filterNodeIdsInRect({
      rect,
      candidateIds,
      match,
      policy,
      getEntry: (nodeId) => {
        const entry = index.node.get(nodeId)
        return entry
          ? {
              node: entry.node,
              rect: entry.geometry.rect,
              rotation: readNodeRotation(entry.node)
            }
          : undefined
      },
      matchEntry: matchCanvasNodeRect
    })
  }

  const readGroupList = () => listGroups(readDocument())
    .map((group) => group.id)

  const readGroupItem = (
    groupId: string
  ) => readDocument().groups[groupId]

  const readNodeGroupId = (
    nodeId: NodeId
  ) => readDocument().nodes[nodeId]?.groupId

  const readEdgeGroupId = (
    edgeId: EdgeId
  ) => readDocument().edges[edgeId]?.groupId

  const readGroupMembers = (
    groupId: string
  ) => listGroupCanvasItemRefs(readDocument(), groupId)

  const readGroupNodeIds = (
    groupId: string
  ) => listGroupNodeIds(readDocument(), groupId)

  const readGroupEdgeIds = (
    groupId: string
  ) => listGroupEdgeIds(readDocument(), groupId)

  const readCommittedTargetNodes: EngineRead['target']['nodes'] = (
    target
  ) => readNodes(target.nodeIds)

  const readCommittedTargetEdges: EngineRead['target']['edges'] = (
    target
  ) => readEdges(target.edgeIds)

  const readCommittedTargetBounds: EngineRead['target']['bounds'] = (
    target
  ) => resolveTargetBounds({
    target,
    readNodeBounds: readProjectedNodeBounds,
    readEdgeBounds
  })

  const readTargetGroupIds = (
    target: SelectionTarget
  ) => {
    const groupIds = new Set<string>()

    target.nodeIds.forEach((nodeId) => {
      const groupId = readNodeGroupId(nodeId)
      if (groupId) {
        groupIds.add(groupId)
      }
    })

    target.edgeIds.forEach((edgeId) => {
      const groupId = readEdgeGroupId(edgeId)
      if (groupId) {
        groupIds.add(groupId)
      }
    })

    return [...groupIds]
  }

  const readWholeGroupIds = (
    target: SelectionTarget
  ): readonly string[] => {
    const selectedNodeIds = new Set(target.nodeIds)
    const selectedEdgeIds = new Set(target.edgeIds)

    return readTargetGroupIds(target).filter((groupId) => {
      const nodeIds = readGroupNodeIds(groupId)
      const edgeIds = readGroupEdgeIds(groupId)

      return (
        (nodeIds.length > 0 || edgeIds.length > 0)
        && nodeIds.every((id) => selectedNodeIds.has(id))
        && edgeIds.every((id) => selectedEdgeIds.has(id))
      )
    })
  }

  const readExactGroupIds = (
    target: SelectionTarget
  ): readonly string[] => {
    const wholeGroupIds = readWholeGroupIds(target)
    if (!wholeGroupIds.length) {
      return EMPTY_GROUP_IDS
    }

    const expectedNodeIds = new Set<string>()
    const expectedEdgeIds = new Set<string>()

    wholeGroupIds.forEach((groupId) => {
      readGroupNodeIds(groupId).forEach((nodeId) => {
        expectedNodeIds.add(nodeId)
      })
      readGroupEdgeIds(groupId).forEach((edgeId) => {
        expectedEdgeIds.add(edgeId)
      })
    })

    if (
      target.nodeIds.length !== expectedNodeIds.size
      || target.edgeIds.length !== expectedEdgeIds.size
    ) {
      return EMPTY_GROUP_IDS
    }

    return (
      target.nodeIds.every((nodeId) => expectedNodeIds.has(nodeId))
      && target.edgeIds.every((edgeId) => expectedEdgeIds.has(edgeId))
    )
      ? wholeGroupIds
      : EMPTY_GROUP_IDS
  }

  const readEdgeBounds = (edgeId: EdgeId): Rect | undefined => {
    const item = edgeProjection.item.get(edgeId)
    if (!item) {
      return undefined
    }

    const path = getEdgePath({
      edge: item.edge,
      source: {
        point: item.ends.source.point,
        side: item.ends.source.anchor?.side
      },
      target: {
        point: item.ends.target.point,
        side: item.ends.target.anchor?.side
      }
    })
    return getEdgePathBounds(path)
  }

  const readMindmapBounds = (treeId: NodeId): Rect | undefined => {
    const item = mindmapProjection.item.get(treeId)
    if (!item) {
      return undefined
    }
    const rects = item.childNodeIds.flatMap((nodeId) => {
      const bounds = readProjectedNodeBounds(nodeId)
      return bounds ? [bounds] : []
    })
    if (!rects.length) {
      return undefined
    }
    return getRectsBoundingRect(rects)
  }

  edgeRectIndex.reset(edgeProjection.list.get(), readEdgeBounds)

  const readEdgeIdsInRect: EngineRead['edge']['idsInRect'] = (
    rect,
    options
  ) => index.edge.idsInRect(rect).filter((edgeId) => {
    const item = edgeProjection.item.get(edgeId)
    if (!item) {
      return false
    }

    const path = getEdgePath({
      edge: item.edge,
      source: {
        point: item.ends.source.point,
        side: item.ends.source.anchor?.side
      },
      target: {
        point: item.ends.target.point,
        side: item.ends.target.anchor?.side
      }
    })

    return matchEdgeRect({
      path,
      queryRect: rect,
      mode: options?.match ?? 'touch'
    })
  })

  const readDocumentBounds = (): Rect | undefined => {
    const rects: Rect[] = nodeRectIndex.all().map((entry) => entry.geometry.bounds)

    edgeProjection.list.get().forEach((edgeId) => {
      const rect = readEdgeBounds(edgeId)
      if (rect) {
        rects.push(rect)
      }
    })

    mindmapProjection.list.get().forEach((treeId) => {
      const rect = readMindmapBounds(treeId)
      if (rect) {
        rects.push(rect)
      }
    })

    return getRectsBoundingRect(rects)
  }

  const applyImpact = (impact: KernelReadImpact) => {
    if (impact.reset || impact.document) {
      background.set(readDocument().background)
    }
    if (impact.reset || impact.document || impact.node.list || impact.edge.list) {
      scene.set(listCanvasItemRefs(readDocument()) as readonly CanvasItemRef[])
    }

    const model = readModel()
    syncIndexes(impact, model)
    const snapshot = createSnapshot(model)
    nodeProjection.applyChange(impact, snapshot, nodeRectIndex.changedIds())
    edgeProjection.applyChange(impact, snapshot)
    edgeRectIndex.applyChange(edgeProjection.changedIds(), readEdgeBounds)
    mindmapProjection.applyChange(impact, snapshot)
  }

  return {
    read: {
      document: {
        background,
        bounds: readDocumentBounds
      },
      frame: {
        list: () => readOrderedNodes()
          .filter((node) => node.type === 'frame')
          .map((node) => node.id),
        rect: readFrameRect,
        at: readFrameNodeAtPoint,
        of: readNodeFrameId,
        members: readFrameMembers,
        contains: (frameId, nodeId, options) => readFrameMembers(frameId, options)
          .includes(nodeId)
      },
      group: {
        list: readGroupList,
        item: readGroupItem,
        ofNode: readNodeGroupId,
        ofEdge: readEdgeGroupId,
        target: (groupId) => resolveGroupTarget({
          groupId,
          readNodeIds: readGroupNodeIds,
          readEdgeIds: readGroupEdgeIds
        }),
        members: readGroupMembers,
        bounds: (groupId) => {
          const target = resolveGroupTarget({
            groupId,
            readNodeIds: readGroupNodeIds,
            readEdgeIds: readGroupEdgeIds
          })
          return target
            ? readCommittedTargetBounds(target)
            : undefined
        },
        wholeIds: readWholeGroupIds,
        exactIds: readExactGroupIds
      },
      target: {
        nodes: readCommittedTargetNodes,
        edges: readCommittedTargetEdges,
        bounds: readCommittedTargetBounds
      },
      node: {
        list: nodeProjection.list,
        item: nodeProjection.item,
        nodes: readNodes,
        geometry: readProjectedNodeGeometry,
        rect: readProjectedNodeRect,
        bounds: readProjectedNodeBounds,
        idsInRect: readNodeIdsInRect
      },
      edge: {
        list: edgeProjection.list,
        item: edgeProjection.item,
        edges: readEdges,
        related: edgeProjection.related,
        idsInRect: readEdgeIdsInRect
      },
      mindmap: {
        list: mindmapProjection.list,
        item: mindmapProjection.item
      },
      scene: {
        list: scene
      },
      slice: {
        fromNodes: (nodeIds) => {
          const exported = exportSliceFromNodes({
            doc: readDocument(),
            ids: nodeIds,
            nodeSize: config.nodeSize
          })
          return exported.ok ? exported.data : undefined
        },
        fromEdge: (edgeId) => {
          const exported = exportSliceFromEdge({
            doc: readDocument(),
            edgeId,
            nodeSize: config.nodeSize
          })
          return exported.ok ? exported.data : undefined
        },
        fromSelection: (selection) => {
          const exported = exportSliceFromSelection({
            doc: readDocument(),
            nodeIds: selection.nodeIds,
            edgeIds: selection.edgeIds,
            nodeSize: config.nodeSize
          })
          return exported.ok ? exported.data : undefined
        }
      },
      index
    },
    invalidate: applyImpact
  }
}
