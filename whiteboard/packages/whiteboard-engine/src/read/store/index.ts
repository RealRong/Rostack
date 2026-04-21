import type { ReadModel } from '@whiteboard/engine/types/read'
import type { EngineDocument, EngineRead, EngineReadIndex } from '@whiteboard/engine/types/instance'
import type { BoardConfig } from '@whiteboard/core/config'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { document as documentApi } from '@whiteboard/core/document'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import {
  type CanvasItemRef,
  type Edge,
  type EdgeId,
  type Invalidation,
  type Node,
  type NodeId,
  type Point,
  type Rect
} from '@whiteboard/core/types'
import { collection, store } from '@shared/core'
import { DEFAULT_TUNING } from '@whiteboard/engine/config'
import { RESET_INVALIDATION } from '@whiteboard/engine/read/invalidation'
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
  invalidate: (invalidation: Invalidation) => void
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
    document: readDocument(),
    model,
    index
  })
  const background = store.createValueStore(readDocument().background)
  const scene = store.createValueStore(
    documentApi.list.canvasRefs(readDocument()) as readonly CanvasItemRef[]
  )

  const syncIndexes = (invalidation: Invalidation, model: ReadModel) => {
    nodeRectIndex.applyChange(invalidation, model)
    snapIndex.applyChange(invalidation, {
      all: nodeRectIndex.all,
      get: nodeRectIndex.byId
    }, nodeRectIndex.changedIds())
  }

  const initialModel = readModel()
  syncIndexes(RESET_INVALIDATION, initialModel)
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
  ) => collection.presentValues(nodeIds, (nodeId) => nodeProjection.item.get(nodeId)?.node)

  const readEdges: EngineRead['edge']['edges'] = (
    edgeIds
  ) => collection.presentValues(edgeIds, (edgeId) => edgeProjection.item.get(edgeId)?.edge)

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
  ): NodeId | undefined => nodeApi.frame.atPoint({
    nodes: readOrderedNodes(),
    point,
    getFrameRect: (node) => readFrameRect(node.id)
  })

  const readNodeFrameId = (
    nodeId: NodeId
  ): NodeId | undefined => nodeApi.frame.of({
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
  ): readonly NodeId[] => nodeApi.frame.collectMembers({
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
    return nodeApi.hit.filterIdsInRect({
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
              rotation: nodeApi.geometry.rotation(entry.node)
            }
          : undefined
      },
      matchEntry: nodeApi.hit.matchRect
    })
  }

  const readGroupList = () => documentApi.list.groups(readDocument())
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
  ) => documentApi.list.groupCanvasRefs(readDocument(), groupId)

  const readGroupNodeIds = (
    groupId: string
  ) => documentApi.list.groupNodeIds(readDocument(), groupId)

  const readGroupEdgeIds = (
    groupId: string
  ) => documentApi.list.groupEdgeIds(readDocument(), groupId)

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

    const path = edgeApi.path.get({
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
    return edgeApi.path.bounds(path)
  }

  const readMindmapBounds = (treeId: NodeId): Rect | undefined => {
    const item = mindmapProjection.layout.get(treeId)
    if (!item) {
      return undefined
    }
    const rects = item.nodeIds.flatMap((nodeId) => {
      const bounds = readProjectedNodeBounds(nodeId)
      return bounds ? [bounds] : []
    })
    if (!rects.length) {
      return undefined
    }
    return geometryApi.rect.boundingRect(rects)
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

    const path = edgeApi.path.get({
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

    return edgeApi.hit.test({
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

    return geometryApi.rect.boundingRect(rects)
  }

  const applyInvalidation = (invalidation: Invalidation) => {
    if (invalidation.document || invalidation.background) {
      background.set(readDocument().background)
    }
    if (invalidation.document || invalidation.canvasOrder) {
      scene.set(documentApi.list.canvasRefs(readDocument()) as readonly CanvasItemRef[])
    }

    const model = readModel()
    syncIndexes(invalidation, model)
    const snapshot = createSnapshot(model)
    nodeProjection.applyChange(invalidation, snapshot, nodeRectIndex.changedIds())
    edgeProjection.applyChange(invalidation, snapshot)
    edgeRectIndex.applyChange(edgeProjection.changedIds(), readEdgeBounds)
    mindmapProjection.applyChange(invalidation, snapshot)
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
        structure: mindmapProjection.structure,
        layout: mindmapProjection.layout,
        scene: mindmapProjection.scene
      },
      scene: {
        list: scene
      },
      slice: {
        fromNodes: (nodeIds) => {
          const exported = documentApi.slice.export.nodes({
            doc: readDocument(),
            ids: nodeIds,
            nodeSize: config.nodeSize
          })
          return exported.ok ? exported.data : undefined
        },
        fromEdge: (edgeId) => {
          const exported = documentApi.slice.export.edge({
            doc: readDocument(),
            edgeId,
            nodeSize: config.nodeSize
          })
          return exported.ok ? exported.data : undefined
        },
        fromSelection: (selection) => {
          const exported = documentApi.slice.export.selection({
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
    invalidate: applyInvalidation
  }
}
