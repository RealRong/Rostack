import type {
  MutationCompileReaderTools
} from '@shared/mutation'
import {
  createMutationReader,
  type MutationReader
} from '@shared/mutation'
import {
  createDocumentReader,
  type DocumentReader
} from '@whiteboard/core/document/reader'
import {
  whiteboardMutationModel
} from '@whiteboard/core/mutation/model'
import type {
  CanvasItemRef,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
} from '@whiteboard/core/types'

type WhiteboardCompileReaderTools = MutationCompileReaderTools
type WhiteboardMutationReader = MutationReader<typeof whiteboardMutationModel>

type RequireReader<TReader, TId extends string, TEntity> = Omit<TReader, 'require'> & {
  require(id: TId, path?: string): TEntity | undefined
}

type WhiteboardDocumentOrderReader = ReturnType<WhiteboardMutationReader['document']['order']> & {
  slot(ref: CanvasItemRef): {
    prev?: CanvasItemRef
    next?: CanvasItemRef
  } | undefined
  groupRefs(groupId: GroupId): readonly CanvasItemRef[]
}

export interface WhiteboardCompileReader {
  document: {
    get(): import('@whiteboard/core/types').Document
    order(): WhiteboardDocumentOrderReader
  }
  node: RequireReader<WhiteboardMutationReader['node'], NodeId, Node>
  edge: RequireReader<WhiteboardMutationReader['edge'], EdgeId, Edge> & {
    connectedToNodes(nodeIds: ReadonlySet<NodeId>): readonly Edge[]
  }
  group: RequireReader<WhiteboardMutationReader['group'], GroupId, Group>
  mindmap: RequireReader<WhiteboardMutationReader['mindmap'], MindmapId, MindmapRecord> & Pick<
    DocumentReader['mindmaps'],
    'tree' | 'subtreeNodeIds' | 'byNode' | 'resolveId' | 'isRoot'
  >
}

const requireEntity = <TEntity>(
  tools: WhiteboardCompileReaderTools | undefined,
  entity: TEntity | undefined,
  message: string,
  path?: string
): TEntity | undefined => {
  if (entity !== undefined) {
    return entity
  }

  tools?.issue({
    source: tools.source,
    code: 'invalid',
    message,
    severity: 'error',
    ...(path === undefined ? {} : { path })
  })
  return undefined
}

export const createCompileReader = (
  readDocument: () => import('@whiteboard/core/types').Document,
  tools?: WhiteboardCompileReaderTools
): WhiteboardCompileReader => {
  const modelReader = createMutationReader(
    whiteboardMutationModel,
    readDocument
  )
  const reader = createDocumentReader(readDocument)

  return {
    document: {
      ...modelReader.document,
      order: () => ({
        ...modelReader.document.order(),
        slot: (ref) => reader.documentOrder.slot(ref),
        groupRefs: (groupId) => reader.documentOrder.groupRefs(groupId)
      })
    },
    node: {
      ...modelReader.node,
      require: (id: NodeId, path = 'id') => requireEntity(
        tools,
        modelReader.node.get(id),
        `Node ${id} not found.`,
        path
      )
    },
    edge: {
      ...modelReader.edge,
      require: (id: EdgeId, path = 'id') => requireEntity(
        tools,
        modelReader.edge.get(id),
        `Edge ${id} not found.`,
        path
      ),
      connectedToNodes: (nodeIds) => reader.edges.connectedToNodes(nodeIds)
    },
    group: {
      ...modelReader.group,
      require: (id: GroupId, path = 'id') => requireEntity(
        tools,
        modelReader.group.get(id),
        `Group ${id} not found.`,
        path
      )
    },
    mindmap: {
      ...modelReader.mindmap,
      require: (id: MindmapId, path = 'id') => requireEntity(
        tools,
        modelReader.mindmap.get(id),
        `Mindmap ${id} not found.`,
        path
      ),
      tree: (id) => reader.mindmaps.tree(id),
      subtreeNodeIds: (id, rootId) => reader.mindmaps.subtreeNodeIds(id, rootId),
      byNode: (nodeId) => reader.mindmaps.byNode(nodeId),
      resolveId: (value) => reader.mindmaps.resolveId(value),
      isRoot: (nodeId) => reader.mindmaps.isRoot(nodeId)
    }
  }
}
