import type { Engine } from '@whiteboard/engine'
import type {
  ClipboardCommands,
  HistoryCommands,
  MindmapCommands
} from '#whiteboard-editor/types/commands'
import type { EditorLocalRuntime } from '#whiteboard-editor/local/runtime'
import type { EditorQueryRead } from '#whiteboard-editor/query'
import {
  createClipboardCommands
} from '#whiteboard-editor/command/clipboard'
import {
  createDocumentCommands
} from '#whiteboard-editor/command/document'
import type { DocumentCommands } from '#whiteboard-editor/command/document'
import {
  createHistoryCommands
} from '#whiteboard-editor/command/history'
import {
  createSelectionCommands,
  type SelectionCommands
} from '#whiteboard-editor/command/selection'
import {
  createEdgeCommands,
  type EdgeCommands
} from '#whiteboard-editor/command/edge'
import {
  createMindmapCommands
} from '#whiteboard-editor/command/mindmap'
import {
  createNodeCommands
} from '#whiteboard-editor/command/node/commands'
import type { NodeCommands } from '#whiteboard-editor/command/node/types'

export type EditorCommandRuntime = {
  document: DocumentCommands
  node: NodeCommands
  edge: EdgeCommands
  mindmap: MindmapCommands
  selection: SelectionCommands
  clipboard: ClipboardCommands
  history: HistoryCommands
}

export const createCommandRuntime = ({
  engine,
  read,
  local
}: {
  engine: Engine
  read: EditorQueryRead
  local: Pick<EditorLocalRuntime, 'actions' | 'stores' | 'viewport'>
}): EditorCommandRuntime => {
  const history = createHistoryCommands(engine)
  const document = createDocumentCommands(engine)
  const node = createNodeCommands({
    engine,
    read,
    preview: local.actions.feedback,
    session: {
      edit: local.actions.edit,
      selection: local.actions.session.selection
    }
  })
  const edge = createEdgeCommands({
    engine,
    read,
    edit: local.stores.edit,
    session: {
      edit: local.actions.edit,
      selection: local.actions.session.selection
    }
  })
  const mindmap = createMindmapCommands({
    execute: engine.execute,
    read,
    node: {
      update: node.update
    }
  })
  const selection = createSelectionCommands({
    read,
    document,
    node,
    session: {
      selection: local.actions.session.selection
    }
  })
  const clipboard = createClipboardCommands({
    editor: {
      read,
      document,
      session: {
        selection: local.actions.session.selection
      },
      selection,
      state: {
        viewport: local.viewport.read,
        selection: local.stores.selection
      }
    }
  })

  return {
    document,
    node,
    edge,
    mindmap,
    selection,
    clipboard,
    history
  }
}
