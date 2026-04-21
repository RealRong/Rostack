import type { Viewport } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
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
  const layout = createEditorLayout({
    read: {
      node: {
        committed: engine.read.node.item
      },
      mindmap: {
        list: engine.read.mindmap.list,
        committed: engine.read.mindmap.layout,
        structure: engine.read.mindmap.structure
      }
    },
    session: {
      edit: session.state.edit,
      mindmapPreview: session.preview.selectors.mindmapPreview
    },
    registry,
    backend: services?.layout
  })
  const defaults = services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const query = createEditorQuery({
    engineRead: engine.read,
    registry,
    history,
    layout,
    session,
    defaults: defaults.selection
  })
  const write = createEditorWrite({
    engine,
    history,
    query,
    layout
  })
  const actions = createEditorActions({
    engine,
    session,
    query,
    layout,
    write,
    registry,
    defaults: defaults.templates
  })
  const host = createEditorHost({
    engine,
    session,
    query,
    layout,
    write,
    actions
  })
  const events = createEditorEvents({
    engine,
    session,
    query,
    resetHost: host.cancel
  })

  return {
    store: createEditorStore(session),
    read: createEditorRead({
      engine,
      query
    }),
    actions,
    input: host,
    events: events.events,
    dispose: () => {
      events.dispose()
      host.cancel()
      session.reset()
      layout.text.clear()
      engine.dispose()
    }
  }
}
