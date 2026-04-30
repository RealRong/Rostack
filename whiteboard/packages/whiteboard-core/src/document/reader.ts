import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  MindmapTree,
  Node,
  NodeId
} from '@whiteboard/core/types'
import {
  getMindmapRecordByNodeId,
  getSubtreeIds,
  resolveMindmapId,
  toMindmapTree
} from '../mindmap/tree'

export interface EntityReader<TId extends string, TEntity> {
  ids(): readonly TId[]
  list(): readonly TEntity[]
  get(id: TId): TEntity | undefined
  has(id: TId): boolean
}

export interface EdgeReader extends EntityReader<EdgeId, Edge> {
  connectedToNodes(nodeIds: ReadonlySet<NodeId>): readonly Edge[]
}

export interface MindmapReader extends EntityReader<MindmapId, MindmapRecord> {
  tree(id: MindmapId): MindmapTree | undefined
  subtreeNodeIds(id: MindmapId, rootId?: NodeId): readonly NodeId[]
  byNode(nodeId: NodeId): MindmapRecord | undefined
  resolveId(value: string): MindmapId | undefined
  isRoot(nodeId: NodeId): boolean
}

export interface DocumentReader {
  document(): Document
  nodes: EntityReader<NodeId, Node>
  edges: EdgeReader
  groups: EntityReader<GroupId, Group>
  mindmaps: MindmapReader
  canvas: {
    order(): readonly CanvasItemRef[]
    slot(ref: CanvasItemRef): {
      prev?: CanvasItemRef
      next?: CanvasItemRef
    } | undefined
    groupRefs(groupId: GroupId): readonly CanvasItemRef[]
  }
}

const createEntityReader = <TId extends string, TEntity>(input: {
  readDocument: () => Document
  ids: (document: Document) => readonly TId[]
  list: (document: Document) => readonly TEntity[]
  get: (document: Document, id: TId) => TEntity | undefined
}): EntityReader<TId, TEntity> => ({
  ids: () => input.ids(input.readDocument()),
  list: () => input.list(input.readDocument()),
  get: (id) => input.get(input.readDocument(), id),
  has: (id) => input.get(input.readDocument(), id) !== undefined
})

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

const cloneCanvasRef = (
  ref: CanvasItemRef | undefined
): CanvasItemRef | undefined => (
  ref
    ? {
        kind: ref.kind,
        id: ref.id
      }
    : undefined
)

const readCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): {
  prev?: CanvasItemRef
  next?: CanvasItemRef
} | undefined => {
  const index = order.findIndex((entry) => sameCanvasRef(entry, ref))
  if (index < 0) {
    return undefined
  }

  return {
    prev: cloneCanvasRef(order[index - 1]),
    next: cloneCanvasRef(order[index + 1])
  }
}

export const createDocumentReader = (
  readDocument: () => Document
): DocumentReader => {
  const nodes = createEntityReader({
    readDocument,
    ids: (document) => Object.keys(document.nodes) as NodeId[],
    list: (document) => Object.values(document.nodes),
    get: (document, id) => document.nodes[id]
  })
  const edges = createEntityReader({
    readDocument,
    ids: (document) => Object.keys(document.edges) as EdgeId[],
    list: (document) => Object.values(document.edges),
    get: (document, id) => document.edges[id]
  })
  const groups = createEntityReader({
    readDocument,
    ids: (document) => Object.keys(document.groups) as GroupId[],
    list: (document) => Object.values(document.groups),
    get: (document, id) => document.groups[id]
  })

  return {
    document: readDocument,
    nodes,
    edges: {
      ...edges,
      connectedToNodes: (nodeIds) => edges.list().filter((edge) => (
        (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
        || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
      ))
    },
    groups,
    mindmaps: {
      ...createEntityReader({
        readDocument,
        ids: (document) => Object.keys(document.mindmaps) as MindmapId[],
        list: (document) => Object.values(document.mindmaps),
        get: (document, id) => document.mindmaps[id]
      }),
      tree: (id) => {
        const record = readDocument().mindmaps[id]
        return record
          ? toMindmapTree(record)
          : undefined
      },
      subtreeNodeIds: (id, rootId) => {
        const record = readDocument().mindmaps[id]
        if (!record) {
          return []
        }

        return getSubtreeIds(
          toMindmapTree(record),
          rootId ?? record.root
        )
      },
      byNode: (nodeId) => getMindmapRecordByNodeId(readDocument(), nodeId),
      resolveId: (value) => resolveMindmapId(readDocument(), value),
      isRoot: (nodeId) => {
        const record = getMindmapRecordByNodeId(readDocument(), nodeId)
        return record?.root === nodeId
      }
    },
    canvas: {
      order: () => readDocument().canvas.order,
      slot: (ref) => readCanvasSlot(readDocument().canvas.order, ref),
      groupRefs: (groupId) => {
        const document = readDocument()
        return document.canvas.order.filter((ref) => (
          ref.kind === 'node'
            ? document.nodes[ref.id]?.groupId === groupId
            : ref.kind === 'edge'
              ? document.edges[ref.id]?.groupId === groupId
              : false
        ))
      }
    }
  }
}
