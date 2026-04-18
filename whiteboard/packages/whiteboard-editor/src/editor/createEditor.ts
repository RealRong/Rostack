import type { Viewport } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/local/draw/state'
import { createEditorActions } from '@whiteboard/editor/action'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorRead } from '@whiteboard/editor/editor/read'
import { createEditorStore } from '@whiteboard/editor/editor/store'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorLayout } from '@whiteboard/editor/layout/runtime'
import { createEditorQuery } from '@whiteboard/editor/query'
import { createEditorSession } from '@whiteboard/editor/session/runtime'
import type { Editor } from '@whiteboard/editor/types/editor'
import type { LayoutBackend } from '@whiteboard/editor/types/layout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import { createEditorWrite } from '@whiteboard/editor/write'

export const createEditor = ({
  engine,
  initialTool,
  initialDrawState = DEFAULT_DRAW_STATE,
  initialViewport,
  registry,
  services,
}: {
  engine: Engine
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
  services?: {
    layout?: LayoutBackend
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
      }
    },
    registry,
    backend: services?.layout
  })
  const query = createEditorQuery({
    engineRead: engine.read,
    registry,
    history: engine.history,
    layout,
    session
  })
  const write = createEditorWrite({
    engine,
    query,
    layout
  })
  const actions = createEditorActions({
    engine,
    session,
    query,
    layout,
    write,
    registry
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
      engine.dispose()
    }
  }
}
