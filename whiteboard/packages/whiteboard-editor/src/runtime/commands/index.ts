import type { Engine } from '@whiteboard/engine'
import type {
  EditorRead,
  EditorState
} from '../../types/editor'
import type {
  ClipboardCommands,
  HistoryCommands,
  MindmapCommands
} from '../../types/commands'
import type { NodeRegistry } from '../../types/node'
import type { EditorStateController } from '../state'
import type { EditorOverlay } from '../overlay'
import type { EditorViewportRuntime } from '../editor/types'
import {
  createDocumentCommands
} from './document'
import type { DocumentCommands } from './document'
import {
  createHistoryCommands
} from './history'
import {
  createSessionCommands
} from './session'
import type { SessionCommands } from './session'
import {
  createViewCommands
} from './view'
import type { ViewCommands } from './view'
import {
  createSelectionCommands,
  type SelectionCommands
} from './selection'
import {
  createClipboardCommands
} from './clipboard'
import {
  createEdgeCommands,
  type EdgeCommands
} from './edge'
import {
  createMindmapCommands
} from './mindmap'
import {
  createNodeCommands
} from '../node/commands'
import type { NodeCommands } from '../node/types'
import {
  createPreviewCommands
} from '../overlay/preview'
import type { PreviewCommands } from '../overlay/preview'
import {
  createEditCommands
} from './edit'

export type EditorCommands = {
  document: DocumentCommands
  node: NodeCommands
  edge: EdgeCommands
  mindmap: MindmapCommands
  selection: SelectionCommands
  clipboard: ClipboardCommands
  history: HistoryCommands
  edit: ReturnType<typeof createEditCommands>
  session: SessionCommands
  view: ViewCommands
  preview: PreviewCommands
}

export const createEditorCommands = ({
  engine,
  read,
  registry,
  runtime,
  overlay,
  viewport,
  state
}: {
  engine: Engine
  read: EditorRead
  registry: NodeRegistry
  runtime: EditorStateController
  overlay: Pick<EditorOverlay, 'set'>
  viewport: EditorViewportRuntime
  state: Pick<EditorState, 'edit' | 'selection' | 'viewport'>
}): EditorCommands => {
  const preview = createPreviewCommands({
    overlay
  })
  const session = createSessionCommands({
    runtime,
    read,
    registry
  })
  const view = createViewCommands({
    runtime,
    viewport
  })
  const history = createHistoryCommands(engine)
  const document = createDocumentCommands(engine)
  const node = createNodeCommands({
    engine,
    read,
    preview,
    session
  })
  const edge = createEdgeCommands({
    engine,
    read,
    edit: state.edit,
    session
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
    session
  })
  const clipboard = createClipboardCommands({
    editor: {
      read,
      document,
      session,
      selection,
      state
    }
  })
  const edit = createEditCommands({
    read,
    edit: state.edit,
    runtime,
    session,
    node,
    edge
  })

  return {
    document,
    node,
    edge,
    mindmap,
    selection,
    clipboard,
    history,
    edit,
    session,
    view,
    preview
  }
}
