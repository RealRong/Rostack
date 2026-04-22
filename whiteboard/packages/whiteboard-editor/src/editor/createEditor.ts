import type { Viewport } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
import { createEditorActions } from '@whiteboard/editor/action'
import { createDocumentRead } from '@whiteboard/editor/document/read'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorRead } from '@whiteboard/editor/editor/read'
import { createEditorStore } from '@whiteboard/editor/editor/store'
import { createEditorGraphDriver } from '@whiteboard/editor/graph/driver'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorLayout } from '@whiteboard/editor/layout/runtime'
import { createProjectionRead } from '@whiteboard/editor/projection/read'
import { createSessionRead } from '@whiteboard/editor/session/read'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/session/draw/state'
import { createEditorSession } from '@whiteboard/editor/session/runtime'
import type { Editor } from '@whiteboard/editor/types/editor'
import {
  DEFAULT_EDITOR_DEFAULTS,
  type EditorDefaults
} from '@whiteboard/editor/types/defaults'
import type {
  LayoutBackend
} from '@whiteboard/editor/types/layout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import { createNodeTypeSupport } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import { createEditorWrite } from '@whiteboard/editor/write'

export const createEditor = ({
  engine,
  history,
  initialTool,
  initialDrawState = DEFAULT_DRAW_STATE,
  initialViewport,
  registry,
  services,
}: {
  engine: Engine
  history: HistoryApi
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
  services?: {
    layout?: LayoutBackend
    defaults?: EditorDefaults
  }
}): Editor => {
  const session = createEditorSession({
    initialTool,
    initialDrawState,
    initialViewport
  })
  const document = createDocumentRead({
    engine
  })
  const layout = createEditorLayout({
    read: {
      node: {
        committed: document.node.committed
      }
    },
    session: {
      edit: session.state.edit
    },
    registry,
    backend: services?.layout
  })
  const defaults = services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const nodeType = createNodeTypeSupport(registry)
  const graph = createEditorGraphDriver({
    engine,
    session,
    layout
  })
  const projection = createProjectionRead({
    document,
    published: graph.sources,
    selection: session.state.selection,
    nodeType
  })
  const sessionRead = createSessionRead(session)
  const write = createEditorWrite({
    engine,
    history,
    document,
    projection,
    layout
  })
  const actions = createEditorActions({
    document,
    session,
    projection,
    layout,
    write,
    registry,
    defaults: defaults.templates
  })
  const host = createEditorHost({
    engine,
    document,
    session,
    projection,
    sessionRead,
    layout,
    write,
    actions
  })
  const events = createEditorEvents({
    engine,
    session,
    document,
    resetHost: host.cancel
  })
  const editorStore = createEditorStore(session)

  return {
    store: editorStore,
    read: createEditorRead({
      document,
      projection,
      sessionRead,
      published: graph.sources,
      store: editorStore,
      history,
      nodeType,
      defaults: defaults.selection
    }),
    actions,
    input: host,
    events: events.events,
    dispose: () => {
      events.dispose()
      graph.dispose()
      host.cancel()
      session.reset()
      layout.text.clear()
    }
  }
}
