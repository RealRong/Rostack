import type { Engine } from '@whiteboard/engine'
import type {
  HistoryCommands,
  MindmapCommands
} from '@whiteboard/editor/types/commands'
import type { EditorQuery } from '@whiteboard/editor/query'
import {
  createDocumentCommands
} from '@whiteboard/editor/write/document'
import type { DocumentCommands } from '@whiteboard/editor/write/document'
import {
  createHistoryCommands
} from '@whiteboard/editor/write/history'
import {
  createEdgeCommands,
  type EdgeCommands
} from '@whiteboard/editor/write/edge'
import {
  createMindmapWrite
} from '@whiteboard/editor/write/mindmap'
import {
  createNodeCommands
} from '@whiteboard/editor/write/node'
import type { NodeCommands } from '@whiteboard/editor/write/node/types'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'

export type EditorWrite = {
  document: DocumentCommands
  node: NodeCommands
  edge: EdgeCommands
  mindmap: MindmapCommands
  history: HistoryCommands
}

export const createEditorWrite = ({
  engine,
  query,
  layout
}: {
  engine: Engine
  query: EditorQuery
  layout: EditorLayout
}): EditorWrite => {
  const history = createHistoryCommands(engine)
  const document = createDocumentCommands(engine)
  const node = createNodeCommands({
    engine,
    read: query,
    layout
  })
  const edge = createEdgeCommands({
    engine,
    read: query
  })
  const mindmap = createMindmapWrite({
    engine,
    read: query,
    node: {
      update: node.update,
      updateMany: node.updateMany
    },
    layout
  })

  return {
    document,
    node,
    edge,
    mindmap,
    history
  }
}
