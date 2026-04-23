import type { Viewport } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
import {
  createEditorActionsApi
} from '@whiteboard/editor/action'
import {
  createEditorBoundaryRuntime
} from '@whiteboard/editor/boundary/runtime'
import {
  createEditorBoundaryTaskRuntime
} from '@whiteboard/editor/boundary/task'
import { createDocumentRead } from '@whiteboard/editor/document/read'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorStore } from '@whiteboard/editor/editor/store'
import {
  createEditorInputApi
} from '@whiteboard/editor/input/host'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorLayout } from '@whiteboard/editor/layout/runtime'
import { createProjectionController } from '@whiteboard/editor/projection/controller'
import { createGraphRead } from '@whiteboard/editor/read/graph'
import { createEditorRead } from '@whiteboard/editor/read/public'
import { createToolService } from '@whiteboard/editor/services/tool'
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
import type { LayoutBackend } from '@whiteboard/editor/types/layout'
import { createNodeTypeSupport, type NodeRegistry } from '@whiteboard/editor/types/node'
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
  const projection = createProjectionController({
    engine,
    session,
    layout
  })
  const graph = createGraphRead({
    document,
    sources: projection.sources,
    selection: session.state.selection,
    nodeType
  })
  const write = createEditorWrite({
    engine,
    history,
    document,
    projection: graph,
    layout
  })
  const tool = createToolService({
    session
  })
  let boundary: ReturnType<typeof createEditorBoundaryRuntime>
  const tasks = createEditorBoundaryTaskRuntime({
    execute: (procedure) => {
      if (!boundary) {
        throw new Error('Editor boundary runtime is not ready.')
      }

      boundary.execute(procedure)
    }
  })
  boundary = createEditorBoundaryRuntime({
    projection,
    tasks
  })
  const actions = createEditorActionsApi({
    boundary,
    engine,
    document,
    session,
    graph,
    layout,
    tool,
    write,
    registry,
    defaults: defaults.templates
  })
  const host = createEditorHost({
    engine,
    document,
    projection: graph,
    session,
    layout,
    write,
    tool,
    registry
  })
  const input = createEditorInputApi({
    boundary,
    host
  })
  const events = createEditorEvents({
    engine,
    session,
    document,
    resetHost: input.cancel
  })
  const editorStore = createEditorStore(session)

  return {
    store: editorStore,
    read: createEditorRead({
      document,
      graph,
      session,
      store: editorStore,
      history,
      nodeType,
      defaults: defaults.selection
    }),
    actions,
    input,
    events: events.events,
    dispose: () => {
      events.dispose()
      host.cancel()
      boundary.dispose()
      projection.dispose()
      session.reset()
      layout.text.clear()
    }
  }
}
