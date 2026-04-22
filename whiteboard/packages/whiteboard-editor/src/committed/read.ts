import { document as documentApi } from '@whiteboard/core/document'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { mindmap as mindmapApi, type MindmapLayout, type MindmapLayoutSpec, type MindmapRenderConnector, type MindmapTree } from '@whiteboard/core/mindmap'
import { node as nodeApi, type SnapCandidate } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  GroupId,
  Node,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  ResolvedEdgeEnds
} from '@whiteboard/core/types/edge'
import type { Engine, Snapshot } from '@whiteboard/engine'
import { equal, store } from '@shared/core'

export type NodeItem = {
  id: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
}

export type EdgeItem = {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}

export type MindmapStructureItem = {
  id: string
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapTree
  layout: MindmapLayoutSpec
}

export type MindmapLayoutItem = {
  id: string
  rootId: NodeId
  nodeIds: readonly NodeId[]
  computed: MindmapLayout
  connectors: readonly MindmapRenderConnector[]
}

export type MindmapSceneItem = {
  id: string
  rootId: NodeId
  nodeIds: readonly NodeId[]
  bbox: Rect
  connectors: readonly MindmapRenderConnector[]
}

export interface CommittedRead {
  document: {
    get: () => Document
    background: store.ReadStore<Document['background'] | undefined>
    bounds: () => Rect
  }
  frame: {
    of: (nodeId: NodeId) => NodeId | undefined
    at: (point: Point) => NodeId | undefined
  }
  group: {
    ofNode: (nodeId: NodeId) => GroupId | undefined
    target: (groupId: GroupId) => SelectionTarget | undefined
    exactIds: (target: SelectionTarget) => readonly GroupId[]
  }
  index: {
    snap: {
      inRect: (rect: Rect) => readonly SnapCandidate[]
    }
  }
  scene: {
    list: store.ReadStore<readonly CanvasItemRef[]>
  }
  slice: {
    fromSelection: (input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }) => SliceExportResult | undefined
  }
  node: {
    list: store.ReadStore<readonly NodeId[]>
    committed: store.KeyedReadStore<NodeId, NodeItem | undefined>
  }
  edge: {
    list: store.ReadStore<readonly EdgeId[]>
    item: store.KeyedReadStore<EdgeId, EdgeItem | undefined>
    related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
    idsInRect: (
      rect: Rect,
      options?: {
        match?: 'touch' | 'contain'
      }
    ) => EdgeId[]
  }
  mindmap: {
    list: store.ReadStore<readonly string[]>
    structure: store.KeyedReadStore<NodeId, MindmapStructureItem | undefined>
    layout: store.KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
  }
}

const EMPTY_CANVAS_REFS: readonly CanvasItemRef[] = []
const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []
const EMPTY_MINDMAP_IDS: readonly string[] = []
const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

const readSnapshotDocument = (
  snapshot: Snapshot
) => snapshot.state.root

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

const isNodeItemEqual = (
  left: NodeItem | undefined,
  right: NodeItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.node === right.node
    && equal.sameRect(left.rect, right.rect)
    && equal.sameRect(left.bounds, right.bounds)
    && left.rotation === right.rotation
  )
)

const isEdgeItemEqual = (
  left: EdgeItem | undefined,
  right: EdgeItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.edge === right.edge
    && edgeApi.equal.resolvedEnd(left.ends.source, right.ends.source)
    && edgeApi.equal.resolvedEnd(left.ends.target, right.ends.target)
  )
)

const isMindmapStructureEqual = (
  left: MindmapStructureItem | undefined,
  right: MindmapStructureItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.rootId === right.rootId
    && left.layout === right.layout
    && left.tree === right.tree
    && equal.sameOrder(left.nodeIds, right.nodeIds)
  )
)

const isMindmapLayoutEqual = (
  left: MindmapLayoutItem | undefined,
  right: MindmapLayoutItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.rootId === right.rootId
    && left.computed === right.computed
    && left.connectors === right.connectors
    && equal.sameOrder(left.nodeIds, right.nodeIds)
  )
)

const buildNodeItem = ({
  node,
  nodeSize
}: {
  node: Node
  nodeSize: Engine['config']['nodeSize']
}): NodeItem => {
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
  nodeSize: Engine['config']['nodeSize']
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

const buildMindmapStructure = ({
  snapshot,
  mindmapId
}: {
  snapshot: Snapshot
  mindmapId: string
}): MindmapStructureItem | undefined => {
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

const buildMindmapLayout = ({
  structure,
  snapshot,
  nodeSize
}: {
  structure: MindmapStructureItem | undefined
  snapshot: Snapshot
  nodeSize: Engine['config']['nodeSize']
}): MindmapLayoutItem | undefined => {
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
  const connectors = mindmapApi.render.resolve({
    tree: structure.tree,
    computed
  }).connectors

  return {
    id: structure.id,
    rootId: structure.rootId,
    nodeIds: structure.nodeIds,
    computed,
    connectors
  }
}

const readEdgeItem = ({
  edge,
  snapshot,
  nodeSize
}: {
  edge: Edge | undefined
  snapshot: Snapshot
  nodeSize: Engine['config']['nodeSize']
}): EdgeItem | undefined => {
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
  nodeSize: Engine['config']['nodeSize']
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

const createFrameRead = ({
  document,
  nodeSize
}: {
  document: () => Document
  nodeSize: Engine['config']['nodeSize']
}) => ({
  of: (nodeId: NodeId) => {
    const nodes = readCanvasNodeCandidates(document())
    return nodeApi.frame.of({
      nodes,
      nodeId,
      getNodeRect: (current) => nodeApi.geometry.rect(current, nodeSize),
      getFrameRect: (current) => (
        current.type === 'frame'
          ? nodeApi.geometry.rect(current, nodeSize)
          : undefined
      )
    })
  },
  at: (point: Point) => {
    const nodes = readCanvasNodeCandidates(document())
    return nodeApi.frame.atPoint({
      nodes,
      point,
      getFrameRect: (current) => (
        current.type === 'frame'
          ? nodeApi.geometry.rect(current, nodeSize)
          : undefined
      )
    })
  }
})

const createGroupRead = ({
  document
}: {
  document: () => Document
}) => ({
  ofNode: (nodeId: NodeId) => document().nodes[nodeId]?.groupId,
  target: (groupId: GroupId) => {
    const current = document()
    if (!current.groups[groupId]) {
      return undefined
    }

    return selectionApi.target.normalize({
      nodeIds: documentApi.list.groupNodeIds(current, groupId),
      edgeIds: documentApi.list.groupEdgeIds(current, groupId)
    })
  },
  exactIds: (target: SelectionTarget) => {
    const current = document()
    const normalized = selectionApi.target.normalize(target)

    return Object.keys(current.groups).filter((groupId) => (
      selectionApi.target.equal(
        normalized,
        selectionApi.target.normalize({
          nodeIds: documentApi.list.groupNodeIds(current, groupId),
          edgeIds: documentApi.list.groupEdgeIds(current, groupId)
        })
      )
    ))
  }
})

export const createCommittedRead = ({
  engine
}: {
  engine: Engine
}): CommittedRead => {
  const snapshotStore = store.createValueStore(engine.snapshot())
  engine.subscribe((snapshot) => {
    snapshotStore.set(snapshot)
  })

  const documentStore = store.createDerivedStore<Document>({
    get: () => readSnapshotDocument(store.read(snapshotStore)),
    isEqual: (left, right) => left === right
  })

  const nodeList = store.createDerivedStore<readonly NodeId[]>({
    get: () => documentApi.list.nodes(store.read(documentStore)).map((node) => node.id),
    isEqual: equal.sameOrder
  })

  const nodeCommitted = store.createKeyedDerivedStore<NodeId, NodeItem | undefined>({
    get: (nodeId) => {
      const node = store.read(documentStore).nodes[nodeId]
      return node
        ? buildNodeItem({
            node,
            nodeSize: engine.config.nodeSize
          })
        : undefined
    },
    isEqual: isNodeItemEqual
  })

  const edgeList = store.createDerivedStore<readonly EdgeId[]>({
    get: () => documentApi.list.edges(store.read(documentStore)).map((edge) => edge.id),
    isEqual: equal.sameOrder
  })

  const edgeRelations = store.createDerivedStore<ReadonlyMap<NodeId, ReadonlySet<EdgeId>>>({
    get: () => edgeApi.relation.create(
      documentApi.list.edges(store.read(documentStore))
    ).nodeToEdgeIds,
    isEqual: (left, right) => left === right
  })

  const edgeItem = store.createKeyedDerivedStore<EdgeId, EdgeItem | undefined>({
    get: (edgeId) => readEdgeItem({
      edge: store.read(documentStore).edges[edgeId],
      snapshot: store.read(snapshotStore),
      nodeSize: engine.config.nodeSize
    }),
    isEqual: isEdgeItemEqual
  })

  const mindmapList = store.createDerivedStore<readonly string[]>({
    get: () => Object.keys(store.read(documentStore).mindmaps),
    isEqual: equal.sameOrder
  })

  const mindmapStructure = store.createKeyedDerivedStore<NodeId, MindmapStructureItem | undefined>({
    get: (id) => {
      const snapshot = store.read(snapshotStore)
      const mindmapId = readMindmapId(snapshot, id)
      return mindmapId
        ? buildMindmapStructure({
            snapshot,
            mindmapId
          })
        : undefined
    },
    isEqual: isMindmapStructureEqual
  })

  const mindmapLayout = store.createKeyedDerivedStore<NodeId, MindmapLayoutItem | undefined>({
    get: (id) => buildMindmapLayout({
      structure: store.read(mindmapStructure, id),
      snapshot: store.read(snapshotStore),
      nodeSize: engine.config.nodeSize
    }),
    isEqual: isMindmapLayoutEqual
  })

  const sceneList = store.createDerivedStore<readonly CanvasItemRef[]>({
    get: () => documentApi.list.canvasRefs(store.read(documentStore)),
    isEqual: equal.sameOrder
  })

  const frame = createFrameRead({
    document: () => store.read(documentStore),
    nodeSize: engine.config.nodeSize
  })
  const group = createGroupRead({
    document: () => store.read(documentStore)
  })

  return {
    document: {
      get: () => store.read(documentStore),
      background: store.createDerivedStore({
        get: () => store.read(documentStore).background,
        isEqual: (left, right) => left === right
      }),
      bounds: () => {
        const rects = store.read(sceneList).flatMap((ref) => {
          switch (ref.kind) {
            case 'node': {
              const item = store.read(nodeCommitted, ref.id)
              return item ? [item.bounds] : []
            }
            case 'edge': {
              const view = readCommittedEdgeView({
                edgeId: ref.id,
                snapshot: store.read(snapshotStore),
                nodeSize: engine.config.nodeSize
              })
              const bounds = view
                ? edgeApi.path.bounds(view.path)
                : undefined
              return bounds ? [bounds] : []
            }
            case 'mindmap': {
              const layout = store.read(mindmapLayout, ref.id)
              return layout ? [layout.computed.bbox] : []
            }
          }
        })

        return (
          rects.length > 0
            ? geometryApi.rect.boundingRect(rects)
            : undefined
        ) ?? EMPTY_RECT
      }
    },
    frame,
    group,
    index: {
      snap: {
        inRect: (rect) => nodeApi.snap.buildCandidates(
          store.read(nodeList).flatMap((nodeId) => {
            const item = store.read(nodeCommitted, nodeId)
            return item
              ? [{
                  id: nodeId,
                  rect: item.rect
                }]
              : []
          }).filter((candidate) => geometryApi.rect.intersects(candidate.rect, rect))
        )
      }
    },
    scene: {
      list: sceneList
    },
    slice: {
      fromSelection: ({
        nodeIds,
        edgeIds
      }) => {
        const exported = documentApi.slice.export.selection({
          doc: store.read(documentStore),
          nodeIds,
          edgeIds,
          nodeSize: engine.config.nodeSize
        })

        return exported.ok
          ? exported.data
          : undefined
      }
    },
    node: {
      list: nodeList,
      committed: nodeCommitted
    },
    edge: {
      list: edgeList,
      item: edgeItem,
      related: (nodeIds) => [...edgeApi.relation.collect(
        store.read(edgeRelations),
        nodeIds
      )],
      idsInRect: (rect, options) => {
        const mode = options?.match ?? 'touch'
        return store.read(edgeList).filter((edgeId) => {
          const view = readCommittedEdgeView({
            edgeId,
            snapshot: store.read(snapshotStore),
            nodeSize: engine.config.nodeSize
          })
          return view
            ? edgeApi.hit.test({
                path: view.path,
                queryRect: rect,
                mode
              })
            : false
        })
      }
    },
    mindmap: {
      list: mindmapList,
      structure: mindmapStructure,
      layout: mindmapLayout
    }
  }
}
