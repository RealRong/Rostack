import type { Engine } from '@whiteboard/engine'
import type {
  HistoryCommands,
  MindmapCommands
} from '@whiteboard/editor/types/commands'
import type { EditorQuery } from '@whiteboard/editor/query'
import {
  createDocumentCommands
} from '@whiteboard/editor/command/document'
import type { DocumentCommands } from '@whiteboard/editor/command/document'
import {
  createHistoryCommands
} from '@whiteboard/editor/command/history'
import {
  createEdgeCommands,
  type EdgeCommands
} from '@whiteboard/editor/command/edge'
import {
  createMindmapCommands
} from '@whiteboard/editor/command/mindmap'
import {
  createNodeCommands
} from '@whiteboard/editor/command/node/commands'
import type { NodeCommands } from '@whiteboard/editor/command/node/types'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorFeedbackRuntime } from '@whiteboard/editor/local/feedback'
import type { EditCaret, EditField } from '@whiteboard/editor/local/session/edit'
import type { EdgeId, NodeId } from '@whiteboard/core/types'

export type EditorCommands = {
  document: DocumentCommands
  node: NodeCommands
  edge: EdgeCommands
  mindmap: MindmapCommands
  history: HistoryCommands
}

export type EditorCommandSession = {
  selection: {
    replace: (input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly string[]
    }) => void
    add: (input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly string[]
    }) => void
    remove: (input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly string[]
    }) => void
    toggle: (input: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly string[]
    }) => void
    selectAll: () => void
    clear: () => void
  }
  edit: {
    startNode: (
      nodeId: NodeId,
      field: EditField,
      options?: {
        caret?: EditCaret
      }
    ) => void
    startEdgeLabel: (
      edgeId: EdgeId,
      labelId: string,
      options?: {
        caret?: EditCaret
      }
    ) => void
    input: (text: string) => void
    caret: (caret: EditCaret) => void
    layout: (patch: Partial<import('@whiteboard/editor/local/session/edit').EditLayout>) => void
    clear: () => void
  }
}

export const createEditorCommands = ({
  engine,
  query,
  layout,
  feedback,
  session
}: {
  engine: Engine
  query: EditorQuery
  layout: EditorLayout
  feedback: Pick<EditorFeedbackRuntime, 'set'>
  session: EditorCommandSession
}): EditorCommands => {
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
  const mindmap = createMindmapCommands({
    engine,
    read: query,
    node: {
      update: node.update,
      updateMany: node.updateMany
    },
    layout,
    feedback: {
      mindmap: {
        setPreview: (preview) => {
          feedback.set((current) => (
            current.mindmap.preview === preview
              ? current
              : {
                  ...current,
                  mindmap: {
                    ...current.mindmap,
                    preview
                  }
                }
          ))
        },
        clear: () => {
          feedback.set((current) => (
            current.mindmap.preview === undefined
              ? current
              : {
                  ...current,
                  mindmap: {}
                }
          ))
        }
      }
    },
    session
  })

  return {
    document,
    node,
    edge,
    mindmap,
    history
  }
}
