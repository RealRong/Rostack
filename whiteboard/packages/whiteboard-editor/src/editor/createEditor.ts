import type { Viewport } from '@whiteboard/core/types'
import { store } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
import { createCommittedRead } from '@whiteboard/editor/committed/read'
import { createEditorGraphDriver } from '@whiteboard/editor/graph/driver'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/session/draw/state'
import { createEditorActions } from '@whiteboard/editor/action'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorRead } from '@whiteboard/editor/editor/read'
import { createEditorStore } from '@whiteboard/editor/editor/store'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorLayout } from '@whiteboard/editor/layout/runtime'
import { createEditorQuery } from '@whiteboard/editor/query'
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
  const committed = createCommittedRead({
    engine
  })
  const mindmapPreview = store.createDerivedStore({
    get: () => store.read(session.preview.state).mindmap.preview,
    isEqual: (left, right) => left === right
  })
  const layout = createEditorLayout({
    read: {
      node: {
        committed: committed.node.committed
      },
      mindmap: {
        list: committed.mindmap.list,
        committed: committed.mindmap.layout,
        structure: committed.mindmap.structure
      }
    },
    session: {
      edit: session.state.edit,
      mindmapPreview
    },
    registry,
    backend: services?.layout
  })
  const defaults = services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const query = createEditorQuery({
    engineRead: committed,
    registry,
    history,
    layout,
    session
  })
  const write = createEditorWrite({
    engine,
    history,
    query,
    layout
  })
  const actions = createEditorActions({
    committed,
    session,
    query,
    layout,
    write,
    registry,
    defaults: defaults.templates
  })
  const host = createEditorHost({
    engine,
    committed,
    session,
    query,
    layout,
    write,
    actions
  })
  const graph = createEditorGraphDriver({
    engine,
    session,
    layout
  })
  const events = createEditorEvents({
    engine,
    session,
    query,
    resetHost: host.cancel
  })
  const editorStore = createEditorStore(session)

  return {
    store: editorStore,
    read: createEditorRead({
      committed,
      query,
      published: graph.sources,
      store: editorStore,
      registry,
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
