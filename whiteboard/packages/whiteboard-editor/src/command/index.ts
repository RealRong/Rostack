import type { Engine } from '@whiteboard/engine'
import type {
  ClipboardCommands,
  HistoryCommands,
  MindmapCommands
} from '../types/commands'
import type { EditorLocalRuntime } from '../local/runtime'
import type { RuntimeRead } from '../query'
import {
  createClipboardCommands
} from './clipboard'
import {
  createDocumentCommands
} from './document'
import type { DocumentCommands } from './document'
import {
  createHistoryCommands
} from './history'
import {
  createSelectionCommands,
  type SelectionCommands
} from './selection'
import {
  createEdgeCommands,
  type EdgeCommands
} from './edge'
import {
  createMindmapCommands
} from './mindmap'
import {
  createNodeCommands
} from './node/commands'
import type { NodeCommands } from './node/types'

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
  read: RuntimeRead
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
