import type { Engine } from '@whiteboard/engine'
import type {
  EditorClipboardApi,
  EditorEdgeActions,
  EditorMindmapCommands,
  EditorRead,
  EditorState
} from '../../types/editor'
import type { NodeRegistry } from '../../types/node'
import type { EditorStateController } from '../state'
import type { EditorOverlay } from '../overlay'
import type { EditorViewportRuntime } from './types'
import {
  createDocumentCommands
} from '../document/commands'
import type { DocumentCommands } from '../document/types'
import {
  createPreviewCommands
} from '../preview/commands'
import type { PreviewCommands } from '../preview/types'
import {
  createSessionCommands
} from '../session/commands'
import type { SessionCommands } from '../session/types'
import {
  createViewCommands
} from '../view/commands'
import type { ViewCommands } from '../view/types'
import {
  createSelectionCommands,
  type SelectionCommands
} from '../selection/commands'
import {
  createClipboardCommands
} from '../clipboard/commands'
import {
  createEdgeLabelCommands
} from '../edgeLabel/commands'
import {
  createEdgeCommands,
  type EdgeCommands
} from '../edge/commands'
import {
  createNodeCommands
} from '../node/commands'
import type { NodeCommands } from '../node/types'
import {
  createMindmapCommands
} from '../mindmap/commands'
import {
  createEditCommands
} from './edit'

export type EditorServices = {
  document: DocumentCommands
  node: NodeCommands
  edge: EdgeCommands
  mindmap: EditorMindmapCommands
  selection: SelectionCommands
  clipboard: EditorClipboardApi
  edgeLabel: EditorEdgeActions['label']
  edit: ReturnType<typeof createEditCommands>
  session: SessionCommands
  view: ViewCommands
  preview: PreviewCommands
}

export const createEditorServices = ({
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
}): EditorServices => {
  const preview = createPreviewCommands({
    overlay
  })
  const session = createSessionCommands({
    engine,
    runtime,
    read,
    registry
  })
  const view = createViewCommands({
    runtime,
    viewport
  })
  const document = createDocumentCommands(engine)
  const node = createNodeCommands({
    engine,
    read,
    preview,
    session
  })
  const edge = createEdgeCommands(engine)
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
  const edgeLabel = createEdgeLabelCommands({
    read,
    edit: state.edit,
    session,
    edge
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
    engine,
    edit: state.edit,
    runtime,
    session,
    node,
    edgeLabel
  })

  return {
    document,
    node,
    edge,
    mindmap,
    selection,
    clipboard,
    edgeLabel,
    edit,
    session,
    view,
    preview
  }
}
