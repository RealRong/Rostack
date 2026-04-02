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
  getNodeOutlineBounds,
  getNodeOutlineRect,
  collectFrameMembers,
  filterNodeIdsInRect,
  resolveSelectionTransformTargets,
  resolveFrameAtPoint,
  resolveNodeFrame,
  matchCanvasNodeRect
} from '@whiteboard/core/node'
import {
  type EdgeId,
  type Node,
  type NodeId,
  type Point,
  type Rect
} from '@whiteboard/core/types'
import { createValueStore } from '../../store'
import { DEFAULT_TUNING } from '../../config'
import { RESET_READ_IMPACT } from '../impacts'
import { NodeRectIndex, SnapIndex, TreeIndex } from '../indexes'
import { createEdgeProjection } from './edge'
import { createReadModel } from './model'
import { createMindmapProjection } from './mindmap'
import { createNodeProjection } from './node'
import { createTreeProjection } from './tree'
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
  const readDocument = document.get
  const readModel = createReadModel({ readDocument })

  const nodeRectIndex = new NodeRectIndex(config)
  const snapIndex = new SnapIndex(
    Math.max(
      config.node.snapGridCellSize,
      config.node.groupPadding * DEFAULT_TUNING.query.snapGridPaddingFactor
    )
  )
  const treeIndex = new TreeIndex()
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
    treeIndex.applyChange(model)
    nodeRectIndex.applyChange(impact, model, treeIndex)
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
  const treeProjection = createTreeProjection({
    readIds: treeIndex.ids
  })

  const readCanvasNode = (
    nodeId: NodeId
  ) => index.node.get(nodeId)

  const readProjectedNodeBounds = (nodeId: NodeId): Rect | undefined => {
    const item = nodeProjection.item.get(nodeId)
    const canvasNode = readCanvasNode(nodeId)
    if (!item || !canvasNode) {
      return undefined
    }

    return item.node.type === 'shape'
      ? getNodeOutlineBounds(
          item.node,
          canvasNode.rect,
          canvasNode.rotation
        )
      : canvasNode.aabb
  }

  const readProjectedNodeFrame = (nodeId: NodeId): Rect | undefined => {
    const item = nodeProjection.item.get(nodeId)
    const canvasNode = readCanvasNode(nodeId)
    if (!item || !canvasNode) {
      return undefined
    }

    return item.node.type === 'shape'
      ? getNodeOutlineRect(item.node, canvasNode.rect)
      : canvasNode.rect
  }

  const readOrderedNodes = (): Node[] => nodeProjection.list.get()
    .map((nodeId) => index.node.get(nodeId)?.node)
    .filter((node): node is Node => Boolean(node))

  const readFrameRect = (
    frameId: NodeId
  ): Rect | undefined => {
    const entry = index.node.get(frameId)
    return entry?.node.type === 'frame'
      ? entry.rect
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
    getNodeRect: (node) => (
      node.type === 'group'
        ? undefined
        : readProjectedNodeBounds(node.id)
    ),
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
    getNodeRect: (node) => (
      node.type === 'group'
        ? undefined
        : readProjectedNodeBounds(node.id)
    ),
    getFrameRect: (node) => readFrameRect(node.id)
  })

  const readNodeIdsInRect = (
    rect: Rect,
    options?: Parameters<typeof index.node.idsInRect>[1]
  ): NodeId[] => {
    const match = options?.match ?? 'touch'
    const candidateIds = index.node.idsInRect(rect, {
      ...options,
      match: match === 'contain' ? 'touch' : match
    })
    return filterNodeIdsInRect({
      rect,
      candidateIds,
      match,
      getEntry: index.node.get,
      getDescendants: treeIndex.ids,
      matchEntry: matchCanvasNodeRect
    })
  }

  const readNodeTransformTargets = (
    nodeIds: readonly NodeId[]
  ) => resolveSelectionTransformTargets(
    index.node.all().map((entry) => ({
      id: entry.node.id,
      node: entry.node,
      rect: entry.rect
    })),
    nodeIds
  )

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
    const rects: Rect[] = nodeRectIndex.all().map((entry) => entry.aabb)

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
    treeProjection.applyChange()
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
      node: {
        list: nodeProjection.list,
        item: nodeProjection.item,
        owner: treeIndex.owner,
        bounds: readProjectedNodeBounds,
        frame: readProjectedNodeFrame,
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
      tree: treeProjection.item,
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
