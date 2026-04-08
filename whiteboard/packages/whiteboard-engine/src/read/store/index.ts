import type { ReadModel } from '@engine-types/read'
import type { EngineDocument, EngineRead, EngineReadIndex } from '@engine-types/instance'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type { BoardConfig } from '@whiteboard/core/config'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import {
  getEdgePath,
  getEdgePathBounds
} from '@whiteboard/core/edge'
import {
  getRectsBoundingRect
} from '@whiteboard/core/geometry'
import {
  exportSliceFromSelection,
  exportSliceFromEdge,
  exportSliceFromNodes
} from '@whiteboard/core/document'
import {
  collectFrameMembers,
  filterNodeIdsInRect,
  resolveSelectionTransformTargets,
  resolveFrameAtPoint,
  resolveNodeFrame,
  matchCanvasNodeRect
} from '@whiteboard/core/node'
import {
  getTargetBounds,
  isSelectionTargetEqual
} from '@whiteboard/core/selection'
import {
  type EdgeId,
  type Node,
  type NodeId,
  type Point,
  type Rect,
  listGroupCanvasItemRefs,
  listGroupEdgeIds,
  listGroupNodeIds,
  listGroups
} from '@whiteboard/core/types'
import { createValueStore } from '@shared/store'
import { DEFAULT_TUNING } from '../../config'
import { RESET_READ_IMPACT } from '../impacts'
import { NodeRectIndex, SnapIndex } from '../indexes'
import { createEdgeProjection } from './edge'
import { createReadModel } from './model'
import { createMindmapProjection } from './mindmap'
import { createNodeProjection } from './node'
import type { ReadSnapshot } from '@engine-types/internal/read'

export const createRead = ({
  document,
  mindmapLayout,
  config
}: {
  document: EngineDocument
  mindmapLayout: () => MindmapLayoutConfig
  config: BoardConfig
}): {
  read: EngineRead
  invalidate: (impact: KernelReadImpact) => void
} => {
  const readNodeRotation = (
    node: Node
  ) => (typeof node.rotation === 'number' ? node.rotation : 0)
  const readDocument = document.get
  const readModel = createReadModel({ readDocument })

  const nodeRectIndex = new NodeRectIndex(config)
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
    mindmapLayout
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

  const readOrderedNodes = (): Node[] => nodeProjection.list.get()
    .map((nodeId) => index.node.get(nodeId)?.node)
    .filter((node): node is Node => Boolean(node))

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

  const readNodeTransformTargets = (
    nodeIds: readonly NodeId[]
  ) => resolveSelectionTransformTargets(
    index.node.all().map((entry) => ({
      id: entry.node.id,
      node: entry.node,
      rect: entry.geometry.rect
    })),
    nodeIds
  )

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

  const readGroupSelection = (
    groupId: string
  ) => {
    if (!readGroupItem(groupId)) {
      return undefined
    }

    const nodeIds = readGroupNodeIds(groupId)
    const edgeIds = readGroupEdgeIds(groupId)
    return nodeIds.length > 0 || edgeIds.length > 0
      ? {
          nodeIds,
          edgeIds
        }
      : undefined
  }

  const isGroupSelected = (
    groupId: string,
    target: {
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }
  ) => {
    const groupSelection = readGroupSelection(groupId)
    return groupSelection
      ? isSelectionTargetEqual(groupSelection, target)
      : false
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
    const position = item.node.position
    if (!position) {
      return undefined
    }

    return {
      x: position.x + item.computed.bbox.x,
      y: position.y + item.computed.bbox.y,
      width: item.computed.bbox.width,
      height: item.computed.bbox.height
    }
  }

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

    const model = readModel()
    syncIndexes(impact, model)
    const snapshot = createSnapshot(model)
    nodeProjection.applyChange(impact, snapshot, nodeRectIndex.changedIds())
    edgeProjection.applyChange(impact, snapshot)
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
        members: readGroupMembers,
        nodeIds: readGroupNodeIds,
        edgeIds: readGroupEdgeIds,
        bounds: (groupId) => {
          const selection = readGroupSelection(groupId)
          return selection
            ? getTargetBounds({
                target: selection,
                readNodeBounds: readProjectedNodeBounds,
                readEdgeBounds
              })
            : undefined
        },
        selection: readGroupSelection,
        isSelected: isGroupSelected
      },
      node: {
        list: nodeProjection.list,
        item: nodeProjection.item,
        geometry: readProjectedNodeGeometry,
        rect: readProjectedNodeRect,
        bounds: readProjectedNodeBounds,
        idsInRect: readNodeIdsInRect,
        transformTargets: readNodeTransformTargets
      },
      edge: {
        list: edgeProjection.list,
        item: edgeProjection.item,
        related: edgeProjection.related
      },
      mindmap: {
        list: mindmapProjection.list,
        item: mindmapProjection.item
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
