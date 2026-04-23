import { document as documentApi } from '@whiteboard/core/document'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi } from '@whiteboard/core/selection'
import type {
  BoardConfig
} from '@whiteboard/core/config'
import type {
  Document,
  Edge,
  EdgeId,
  GroupId,
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  EngineEdgeQueryItem,
  EngineMindmapQueryItem,
  EngineNodeQueryItem,
  EnginePublish,
  EngineQuery,
  Snapshot
} from '../contracts/document'

const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

const buildNodeItem = ({
  node,
  nodeSize
}: {
  node: Node
  nodeSize: BoardConfig['nodeSize']
}): EngineNodeQueryItem => {
  const rect = nodeApi.geometry.rect(node, nodeSize)
  const rotation = nodeApi.geometry.rotation(node)
  const bounds = nodeApi.outline.geometry(
    node,
    rect,
    rotation
  ).bounds

  return {
    id: node.id,
    node,
    rect,
    bounds,
    rotation
  }
}

const readCommittedNodeSnapshot = ({
  node,
  nodeSize
}: {
  node: Node | undefined
  nodeSize: BoardConfig['nodeSize']
}) => {
  if (!node) {
    return undefined
  }

  const item = buildNodeItem({
    node,
    nodeSize
  })

  return {
    node,
    geometry: nodeApi.outline.geometry(
      node,
      item.rect,
      item.rotation
    )
  }
}

const readMindmapId = (
  snapshot: Snapshot,
  value: string
): string | undefined => {
  if (snapshot.state.facts.entities.owners.mindmaps.has(value)) {
    return value
  }

  const owner = snapshot.state.facts.relations.nodeOwner.get(value)
  return owner?.kind === 'mindmap'
    ? owner.id
    : undefined
}

const buildMindmapStructure = ({
  snapshot,
  mindmapId
}: {
  snapshot: Snapshot
  mindmapId: string
}): EngineMindmapQueryItem | undefined => {
  const record = snapshot.state.root.mindmaps[mindmapId]
  if (!record) {
    return undefined
  }

  const tree = mindmapApi.tree.fromRecord(record)
  const nodeIds = snapshot.state.facts.relations.ownerNodes.mindmaps.get(mindmapId)
    ?? mindmapApi.tree.subtreeIds(tree, tree.rootNodeId)

  return {
    id: mindmapId,
    rootId: record.root,
    nodeIds,
    tree,
    layout: tree.layout
  }
}

const buildMindmapBounds = ({
  snapshot,
  nodeSize,
  mindmapId
}: {
  snapshot: Snapshot
  nodeSize: BoardConfig['nodeSize']
  mindmapId: string
}): Rect | undefined => {
  const structure = buildMindmapStructure({
    snapshot,
    mindmapId
  })
  if (!structure) {
    return undefined
  }

  const rootNode = snapshot.state.root.nodes[structure.rootId]
  if (!rootNode) {
    return undefined
  }

  const computed = mindmapApi.layout.anchor({
    tree: structure.tree,
    computed: mindmapApi.layout.compute(
      structure.tree,
      (nodeId) => {
        const node = snapshot.state.root.nodes[nodeId]
        if (!node) {
          return {
            width: 1,
            height: 1
          }
        }

        const item = buildNodeItem({
          node,
          nodeSize
        })

        return {
          width: item.rect.width,
          height: item.rect.height
        }
      },
      structure.layout
    ),
    position: rootNode.position
  })

  return computed.bbox
}

const readEdgeItem = ({
  edge,
  snapshot,
  nodeSize
}: {
  edge: Edge | undefined
  snapshot: Snapshot
  nodeSize: BoardConfig['nodeSize']
}): EngineEdgeQueryItem | undefined => {
  if (!edge) {
    return undefined
  }

  const ends = edgeApi.end.resolve({
    edge,
    source: edge.source.kind === 'node'
      ? readCommittedNodeSnapshot({
          node: snapshot.state.root.nodes[edge.source.nodeId],
          nodeSize
        })
      : undefined,
    target: edge.target.kind === 'node'
      ? readCommittedNodeSnapshot({
          node: snapshot.state.root.nodes[edge.target.nodeId],
          nodeSize
        })
      : undefined
  })
  if (!ends) {
    return undefined
  }

  return {
    id: edge.id,
    edge,
    ends
  }
}

const readCommittedEdgeView = ({
  edgeId,
  snapshot,
  nodeSize
}: {
  edgeId: EdgeId
  snapshot: Snapshot
  nodeSize: BoardConfig['nodeSize']
}) => {
  const edge = snapshot.state.root.edges[edgeId]
  if (!edge) {
    return undefined
  }

  try {
    return edgeApi.view.resolve({
      edge,
      source: edge.source.kind === 'node'
        ? readCommittedNodeSnapshot({
            node: snapshot.state.root.nodes[edge.source.nodeId],
            nodeSize
          })
        : undefined,
      target: edge.target.kind === 'node'
        ? readCommittedNodeSnapshot({
            node: snapshot.state.root.nodes[edge.target.nodeId],
            nodeSize
          })
        : undefined
    })
  } catch {
    return undefined
  }
}

const readCanvasNodeCandidates = (
  document: Document
): readonly Node[] => Object.values(document.nodes)
  .filter((node) => !node.owner)

export const createEngineQuery = ({
  config,
  current
}: {
  config: {
    nodeSize: BoardConfig['nodeSize']
  }
  current: () => EnginePublish
}): EngineQuery => {
  const snapshot = () => current().snapshot
  const document = () => snapshot().state.root

  return {
    document,
    background: () => document().background,
    bounds: () => {
      const currentSnapshot = snapshot()
      const rects = documentApi.list.canvasRefs(document()).flatMap((ref) => {
        switch (ref.kind) {
          case 'node': {
            const item = buildNodeItem({
              node: currentSnapshot.state.root.nodes[ref.id],
              nodeSize: config.nodeSize
            })
            return item ? [item.bounds] : []
          }
          case 'edge': {
            const view = readCommittedEdgeView({
              edgeId: ref.id,
              snapshot: currentSnapshot,
              nodeSize: config.nodeSize
            })
            const bounds = view
              ? edgeApi.path.bounds(view.path)
              : undefined
            return bounds ? [bounds] : []
          }
          case 'mindmap': {
            const bounds = buildMindmapBounds({
              snapshot: currentSnapshot,
              nodeSize: config.nodeSize,
              mindmapId: ref.id
            })
            return bounds ? [bounds] : []
          }
        }
      })

      return (
        rects.length > 0
          ? geometryApi.rect.boundingRect(rects)
          : undefined
      ) ?? EMPTY_RECT
    },
    scene: () => documentApi.list.canvasRefs(document()),
    frameOf: (nodeId) => {
      const nodes = readCanvasNodeCandidates(document())
      return nodeApi.frame.of({
        nodes,
        nodeId,
        getNodeRect: (currentNode) => nodeApi.geometry.rect(currentNode, config.nodeSize),
        getFrameRect: (currentNode) => (
          currentNode.type === 'frame'
            ? nodeApi.geometry.rect(currentNode, config.nodeSize)
            : undefined
        )
      })
    },
    frameAt: (point) => {
      const nodes = readCanvasNodeCandidates(document())
      return nodeApi.frame.atPoint({
        nodes,
        point,
        getFrameRect: (currentNode) => (
          currentNode.type === 'frame'
            ? nodeApi.geometry.rect(currentNode, config.nodeSize)
            : undefined
        )
      })
    },
    groupOfNode: (nodeId) => document().nodes[nodeId]?.groupId,
    groupTarget: (groupId) => {
      const currentDocument = document()
      if (!currentDocument.groups[groupId]) {
        return undefined
      }

      return selectionApi.target.normalize({
        nodeIds: documentApi.list.groupNodeIds(currentDocument, groupId),
        edgeIds: documentApi.list.groupEdgeIds(currentDocument, groupId)
      })
    },
    groupExactIds: (target) => {
      const currentDocument = document()
      const normalized = selectionApi.target.normalize(target)

      return Object.keys(currentDocument.groups).filter((groupId) => (
        selectionApi.target.equal(
          normalized,
          selectionApi.target.normalize({
            nodeIds: documentApi.list.groupNodeIds(currentDocument, groupId),
            edgeIds: documentApi.list.groupEdgeIds(currentDocument, groupId)
          })
        )
      ))
    },
    snapCandidatesInRect: (rect) => nodeApi.snap.buildCandidates(
      documentApi.list.nodes(document()).flatMap((currentNode) => {
        const item = buildNodeItem({
          node: currentNode,
          nodeSize: config.nodeSize
        })

        return geometryApi.rect.intersects(item.rect, rect)
          ? [{
              id: currentNode.id,
              rect: item.rect
            }]
          : []
      })
    ),
    sliceFromSelection: ({
      nodeIds,
      edgeIds
    }) => {
      const exported = documentApi.slice.export.selection({
        doc: document(),
        nodeIds,
        edgeIds,
        nodeSize: config.nodeSize
      })

      return exported.ok
        ? exported.data
        : undefined
    },
    nodeIds: () => documentApi.list.nodes(document()).map((node) => node.id),
    node: (id) => {
      const currentNode = document().nodes[id]
      return currentNode
        ? buildNodeItem({
            node: currentNode,
            nodeSize: config.nodeSize
          })
        : undefined
    },
    edgeIds: () => documentApi.list.edges(document()).map((edge) => edge.id),
    edge: (id) => readEdgeItem({
      edge: document().edges[id],
      snapshot: snapshot(),
      nodeSize: config.nodeSize
    }),
    relatedEdges: (nodeIds) => [...edgeApi.relation.collect(
      edgeApi.relation.create(
        documentApi.list.edges(document())
      ).nodeToEdgeIds,
      nodeIds
    )],
    edgeIdsInRect: (rect, options) => {
      const match = options?.match ?? 'touch'

      return documentApi.list.edges(document())
        .map((edge) => edge.id)
        .filter((edgeId) => {
          const view = readCommittedEdgeView({
            edgeId,
            snapshot: snapshot(),
            nodeSize: config.nodeSize
          })

          return view
            ? edgeApi.hit.test({
                path: view.path,
                queryRect: rect,
                mode: match
              })
            : false
        })
    },
    mindmapIds: () => Object.keys(document().mindmaps),
    mindmap: (id) => {
      const currentSnapshot = snapshot()
      const mindmapId = readMindmapId(currentSnapshot, id)

      return mindmapId
        ? buildMindmapStructure({
            snapshot: currentSnapshot,
            mindmapId
          })
        : undefined
    }
  }
}
