import type {
  MutationReader,
} from '@shared/mutation'
import {
  getMindmapRecordByNodeId,
  getSubtreeIds,
  resolveMindmapId,
  toMindmapTree,
} from '@whiteboard/core/mindmap/tree'
import {
  whiteboardMutationModel,
} from '@whiteboard/core/mutation/model'
import type {
  CanvasItemRef,
  Edge,
  GroupId,
  MindmapId,
  MindmapRecord,
  MindmapTree,
  NodeId,
} from '@whiteboard/core/types'

export type WhiteboardReader = MutationReader<typeof whiteboardMutationModel>

export interface WhiteboardQuery {
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

export const createWhiteboardQuery = (
  reader: WhiteboardReader,
): WhiteboardQuery => {
  const readDocument = () => reader.document.get()
  const readMindmapRecord = (id: MindmapId) => reader.mindmap.get(id)

  return {
    edge: {
      connectedToNodes: (nodeIds) => reader.edge.list().filter((edge) => (
        (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
        || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
      )),
    },
    mindmap: {
      tree: (id) => {
        const record = readMindmapRecord(id)
        return record
          ? toMindmapTree(record)
          : undefined
      },
      subtreeNodeIds: (id, rootId) => {
        const record = readMindmapRecord(id)
        if (!record) {
          return []
        }

        return getSubtreeIds(
          toMindmapTree(record),
          rootId ?? record.root,
        )
      },
      byNode: (nodeId) => getMindmapRecordByNodeId(readDocument(), nodeId),
      resolveId: (value) => resolveMindmapId(readDocument(), value),
      isRoot: (nodeId) => {
        const record = getMindmapRecordByNodeId(readDocument(), nodeId)
        return record?.root === nodeId
      },
    },
    order: {
      slot: (ref) => {
        const order = reader.document.order().items()
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
        return reader.document.order().items().filter((ref) => (
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
