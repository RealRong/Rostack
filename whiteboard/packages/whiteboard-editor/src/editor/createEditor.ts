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
import { createDocumentSource } from '@whiteboard/editor/document/source'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createSessionState } from '@whiteboard/editor/session/state'
import {
  createEditorInputApi
} from '@whiteboard/editor/input/host'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorLayout } from '@whiteboard/editor/layout/runtime'
import { createSceneController } from '@whiteboard/editor/projection/controller'
import { createSceneSource } from '@whiteboard/editor/scene/source'
import { createSessionSource } from '@whiteboard/editor/session/source'
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
  const document = createDocumentSource({
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
  const projection = createSceneController({
    engine,
    session,
    layout
  })
  const scene = createSceneSource({
    controller: projection,
    selection: session.state.selection,
    nodeType,
    visibleRect: () => session.viewport.read.worldRect(),
    readZoom: () => session.viewport.read.get().zoom
  })
  const writeRuntime = createEditorWrite({
    engine,
    history,
    document,
    projection: scene,
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
    graph: scene,
    layout,
    tool,
    write: writeRuntime,
    registry,
    defaults: defaults.templates
  })
  const host = createEditorHost({
    engine,
    document,
    projection: scene,
    session,
    layout,
    write: writeRuntime,
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
  const sessionState = createSessionState(session)
  const sessionSource = createSessionSource({
    graph: scene,
    session,
    state: sessionState,
    history,
    nodeType,
    defaults: defaults.selection
  })

  return {
    document,
    scene,
    session: sessionSource,
    write: actions,
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
