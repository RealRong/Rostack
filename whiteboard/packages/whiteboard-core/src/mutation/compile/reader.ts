import type {
  MutationCompileReaderTools
} from '@shared/mutation'
import {
  createDocumentReader,
  type DocumentReader
} from '@whiteboard/core/document/reader'
import type {
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

type RequireReader<TReader, TId extends string, TEntity> = TReader & {
  require(id: TId, path?: string): TEntity | undefined
}

export interface WhiteboardCompileReader extends Omit<
  DocumentReader,
  'nodes' | 'edges' | 'groups' | 'mindmaps'
> {
  nodes: RequireReader<DocumentReader['nodes'], NodeId, Node>
  edges: RequireReader<DocumentReader['edges'], EdgeId, Edge>
  groups: RequireReader<DocumentReader['groups'], GroupId, Group>
  mindmaps: RequireReader<DocumentReader['mindmaps'], MindmapId, MindmapRecord>
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
  const reader = createDocumentReader(readDocument)

  return {
    ...reader,
    nodes: {
      ...reader.nodes,
      require: (id, path = 'id') => requireEntity(
        tools,
        reader.nodes.get(id),
        `Node ${id} not found.`,
        path
      )
    },
    edges: {
      ...reader.edges,
      require: (id, path = 'id') => requireEntity(
        tools,
        reader.edges.get(id),
        `Edge ${id} not found.`,
        path
      )
    },
    groups: {
      ...reader.groups,
      require: (id, path = 'id') => requireEntity(
        tools,
        reader.groups.get(id),
        `Group ${id} not found.`,
        path
      )
    },
    mindmaps: {
      ...reader.mindmaps,
      require: (id, path = 'id') => requireEntity(
        tools,
        reader.mindmaps.get(id),
        `Mindmap ${id} not found.`,
        path
      )
    }
  }
}
