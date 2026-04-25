import type { SliceExportResult } from '@whiteboard/core/document'
import { document as documentApi } from '@whiteboard/core/document'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  Document,
  Edge,
  EdgeId,
  Node,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type { ResolvedEdgeEnds } from '@whiteboard/core/types/edge'
import type { Engine, Snapshot } from '@whiteboard/engine'
import { equal, store } from '@shared/core'

export type DocumentNodeItem = {
  id: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
}

export type DocumentEdgeItem = {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}

export type EditorDocumentSource = {
  get: () => Document
  background: store.ReadStore<Document['background'] | undefined>
  bounds: () => Rect
  slice: (input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) => SliceExportResult | undefined
  nodes: {
    get: (id: NodeId) => DocumentNodeItem | undefined
    getMany: (ids: readonly NodeId[]) => readonly DocumentNodeItem[]
    ids: () => readonly NodeId[]
    read: store.KeyedReadStore<NodeId, DocumentNodeItem | undefined>
  }
  edges: {
    get: (id: EdgeId) => DocumentEdgeItem | undefined
    getMany: (ids: readonly EdgeId[]) => readonly DocumentEdgeItem[]
    ids: () => readonly EdgeId[]
    read: store.KeyedReadStore<EdgeId, DocumentEdgeItem | undefined>
  }
}

export type EditorDocumentRuntimeSource = EditorDocumentSource & {
  document: {
    get: () => Document
    background: store.ReadStore<Document['background'] | undefined>
    bounds: () => Rect
  }
  node: {
    list: store.ReadStore<readonly NodeId[]>
    committed: store.KeyedReadStore<NodeId, DocumentNodeItem | undefined>
  }
  edge: {
    list: store.ReadStore<readonly EdgeId[]>
    item: store.KeyedReadStore<EdgeId, DocumentEdgeItem | undefined>
  }
}

const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

const isNodeItemEqual = (
  left: DocumentNodeItem | undefined,
  right: DocumentNodeItem | undefined
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
  left: DocumentEdgeItem | undefined,
  right: DocumentEdgeItem | undefined
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

const buildNodeItem = ({
  node,
  nodeSize
}: {
  node: Node
  nodeSize: Engine['config']['nodeSize']
}): DocumentNodeItem => {
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

const readEdgeItem = ({
  edge,
  snapshot,
  nodeSize
}: {
  edge: Edge | undefined
  snapshot: Snapshot
  nodeSize: Engine['config']['nodeSize']
}): DocumentEdgeItem | undefined => {
  if (!edge) {
    return undefined
  }

  const ends = edgeApi.end.resolve({
    edge,
    source: edge.source.kind === 'node'
      ? readCommittedNodeSnapshot({
          node: snapshot.document.nodes[edge.source.nodeId],
          nodeSize
        })
      : undefined,
    target: edge.target.kind === 'node'
      ? readCommittedNodeSnapshot({
          node: snapshot.document.nodes[edge.target.nodeId],
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
  const edge = snapshot.document.edges[edgeId]
  if (!edge) {
    return undefined
  }

  try {
    return edgeApi.view.resolve({
      edge,
      source: edge.source.kind === 'node'
        ? readCommittedNodeSnapshot({
            node: snapshot.document.nodes[edge.source.nodeId],
            nodeSize
          })
        : undefined,
      target: edge.target.kind === 'node'
        ? readCommittedNodeSnapshot({
            node: snapshot.document.nodes[edge.target.nodeId],
            nodeSize
          })
        : undefined
    })
  } catch {
    return undefined
  }
}

const collectPresentValues = <TValue>(
  ids: readonly string[],
  readValue: (id: string) => TValue | undefined
): readonly TValue[] => ids.flatMap((id) => {
  const value = readValue(id)
  return value ? [value] : []
})

export const createDocumentSource = ({
  engine
}: {
  engine: Engine
}): EditorDocumentRuntimeSource => {
  const snapshotStore = store.createValueStore(engine.current().snapshot)
  engine.subscribe((publish) => {
    snapshotStore.set(publish.snapshot)
  })

  const documentStore = store.createDerivedStore<Document>({
    get: () => store.read(snapshotStore).document,
    isEqual: (left, right) => left === right
  })

  const nodeList = store.createDerivedStore<readonly NodeId[]>({
    get: () => Object.keys(store.read(documentStore).nodes) as readonly NodeId[],
    isEqual: equal.sameOrder
  })

  const nodeCommitted = store.createKeyedDerivedStore<NodeId, DocumentNodeItem | undefined>({
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
    get: () => Object.keys(store.read(documentStore).edges) as readonly EdgeId[],
    isEqual: equal.sameOrder
  })

  const edgeItem = store.createKeyedDerivedStore<EdgeId, DocumentEdgeItem | undefined>({
    get: (edgeId) => readEdgeItem({
      edge: store.read(documentStore).edges[edgeId],
      snapshot: store.read(snapshotStore),
      nodeSize: engine.config.nodeSize
    }),
    isEqual: isEdgeItemEqual
  })

  const background = store.createDerivedStore({
    get: () => store.read(documentStore).background,
    isEqual: (left, right) => left === right
  })

  const bounds = () => {
    const nodeBounds = store.read(nodeList).flatMap((nodeId) => {
      const item = store.read(nodeCommitted, nodeId)
      return item ? [item.bounds] : []
    })
    const edgeBounds = store.read(edgeList).flatMap((edgeId) => {
      const view = readCommittedEdgeView({
        edgeId,
        snapshot: store.read(snapshotStore),
        nodeSize: engine.config.nodeSize
      })
      const viewBounds = view
        ? edgeApi.path.bounds(view.path)
        : undefined

      return viewBounds ? [viewBounds] : []
    })
    const merged = geometryApi.rect.boundingRect([
      ...nodeBounds,
      ...edgeBounds
    ])

    return merged ?? EMPTY_RECT
  }

  const slice: EditorDocumentSource['slice'] = ({
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

  const nodes: EditorDocumentSource['nodes'] = {
    get: (nodeId) => store.read(nodeCommitted, nodeId),
    getMany: (nodeIds) => collectPresentValues(nodeIds as readonly string[], (nodeId) => (
      store.read(nodeCommitted, nodeId as NodeId)
    )) as readonly DocumentNodeItem[],
    ids: () => store.read(nodeList),
    read: nodeCommitted
  }

  const edges: EditorDocumentSource['edges'] = {
    get: (edgeId) => store.read(edgeItem, edgeId),
    getMany: (edgeIds) => collectPresentValues(edgeIds as readonly string[], (edgeId) => (
      store.read(edgeItem, edgeId as EdgeId)
    )) as readonly DocumentEdgeItem[],
    ids: () => store.read(edgeList),
    read: edgeItem
  }

  return {
    get: () => store.read(documentStore),
    background,
    bounds,
    slice,
    nodes,
    edges,
    document: {
      get: () => store.read(documentStore),
      background,
      bounds
    },
    node: {
      list: nodeList,
      committed: nodeCommitted
    },
    edge: {
      list: edgeList,
      item: edgeItem
    }
  }
}
