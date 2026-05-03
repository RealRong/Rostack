import type {
  MutationDeltaSource,
} from '@shared/mutation'
import {
  createMutationDelta,
} from '@shared/mutation'
import {
  getMindmapRecordByNodeId,
  readMindmapRootId,
  getSubtreeIds,
  resolveMindmapId,
  toMindmapTree,
} from '@whiteboard/core/mindmap/tree'
import {
  whiteboardMutationSchema,
  type WhiteboardMutationDelta,
} from '@whiteboard/core/mutation/model'
import type {
  CanvasItemRef,
  Document,
  Edge,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  MindmapTree,
  Node,
  NodeId,
} from '@whiteboard/core/types'
import {
  canvasRefKey,
} from '@whiteboard/core/mutation/support'

type EntityReader<TId extends string, TValue> = {
  ids(): readonly TId[]
  has(id: TId): boolean
  get(id: TId): TValue | undefined
  list(): readonly TValue[]
}

export interface WhiteboardReader {
  value(): Document
  order: {
    ids(): readonly string[]
    items(): readonly CanvasItemRef[]
    contains(ref: CanvasItemRef): boolean
    indexOf(ref: CanvasItemRef): number
  }
  node: EntityReader<NodeId, Node>
  edge: EntityReader<string, Edge>
  group: EntityReader<GroupId, Group>
  mindmap: EntityReader<MindmapId, MindmapRecord>
}

export interface WhiteboardQuery {
  changes(input?: MutationDeltaSource<typeof whiteboardMutationSchema>): WhiteboardMutationDelta
  edge: {
    connectedToNodes(nodeIds: ReadonlySet<NodeId>): readonly Edge[]
  }
  mindmap: {
    tree(id: MindmapId): MindmapTree | undefined
    subtreeNodeIds(id: MindmapId, rootId?: NodeId): readonly NodeId[]
    byNode(nodeId: NodeId): MindmapRecord | undefined
    resolveId(value: string): MindmapId | undefined
    isRoot(nodeId: NodeId): boolean
  }
  order: {
    slot(ref: CanvasItemRef): {
      prev?: CanvasItemRef
      next?: CanvasItemRef
    } | undefined
  }
  group: {
    refsInOrder(groupId: GroupId): readonly CanvasItemRef[]
  }
}

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef,
): boolean => left.kind === right.kind && left.id === right.id

const cloneCanvasRef = (
  ref: CanvasItemRef | undefined,
): CanvasItemRef | undefined => (
  ref
    ? {
        kind: ref.kind,
        id: ref.id,
      }
    : undefined
)

const createEntityReader = <TId extends string, TValue>(input: {
  readMap(): Readonly<Record<TId, TValue>>
}): EntityReader<TId, TValue> => ({
  ids: () => Object.keys(input.readMap()) as unknown as readonly TId[],
  has: (id) => input.readMap()[id] !== undefined,
  get: (id) => input.readMap()[id],
  list: () => Object.values(input.readMap()),
})

export const createWhiteboardReader = (
  readDocument: () => Document
): WhiteboardReader => {
  return {
    value: readDocument,
    order: {
      ids: () => readDocument().order.map(canvasRefKey),
      items: () => readDocument().order.map((ref) => cloneCanvasRef(ref)!),
      contains: (ref) => readDocument().order.some((entry) => sameCanvasRef(entry, ref)),
      indexOf: (ref) => readDocument().order.findIndex((entry) => sameCanvasRef(entry, ref)),
    },
    node: createEntityReader({
      readMap: () => readDocument().nodes
    }),
    edge: createEntityReader({
      readMap: () => readDocument().edges
    }),
    group: createEntityReader({
      readMap: () => readDocument().groups
    }),
    mindmap: createEntityReader({
      readMap: () => readDocument().mindmaps
    }),
  }
}

export const createWhiteboardQuery = (
  readDocument: () => Document,
): WhiteboardQuery => {
  const read = createWhiteboardReader(readDocument)

  return {
    changes: (changeInput) => createMutationDelta(whiteboardMutationSchema, changeInput),
    edge: {
      connectedToNodes: (nodeIds) => read.edge.list().filter((edge) => (
        (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
        || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
      )),
    },
    mindmap: {
      tree: (id) => {
        const record = read.mindmap.get(id)
        return record
          ? toMindmapTree(record)
          : undefined
      },
      subtreeNodeIds: (id, rootId) => {
        const record = read.mindmap.get(id)
        if (!record) {
          return []
        }

        return getSubtreeIds(
          toMindmapTree(record),
          rootId ?? readMindmapRootId(record)!,
        )
      },
      byNode: (nodeId) => getMindmapRecordByNodeId(readDocument(), nodeId),
      resolveId: (value) => resolveMindmapId(readDocument(), value),
      isRoot: (nodeId) => {
        const record = getMindmapRecordByNodeId(readDocument(), nodeId)
        return readMindmapRootId(record) === nodeId
      },
    },
    order: {
      slot: (ref) => {
        const order = read.order.items()
        const index = order.findIndex((entry) => sameCanvasRef(entry, ref))
        if (index < 0) {
          return undefined
        }

        return {
          prev: cloneCanvasRef(order[index - 1]),
          next: cloneCanvasRef(order[index + 1]),
        }
      },
    },
    group: {
      refsInOrder: (groupId) => {
        const document = readDocument()
        return read.order.items().filter((ref) => (
          ref.kind === 'node'
            ? document.nodes[ref.id]?.groupId === groupId
            : ref.kind === 'edge'
              ? document.edges[ref.id]?.groupId === groupId
              : false
        ))
      },
    },
  }
}

export type {
  WhiteboardMutationDelta
}
