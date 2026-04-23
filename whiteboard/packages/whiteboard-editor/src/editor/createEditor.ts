import type { Viewport } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { HistoryApi } from '@whiteboard/history'
import {
  createEditorActionCommands,
  createEditorActions
} from '@whiteboard/editor/action'
import {
  createEditorCommandContext,
  type EditorCommandContext
} from '@whiteboard/editor/command/context'
import { createEditorCommandRunner } from '@whiteboard/editor/command/runner'
import { createEditorCommandTaskRuntime } from '@whiteboard/editor/command/task'
import { createDocumentRead } from '@whiteboard/editor/document/read'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorStore } from '@whiteboard/editor/editor/store'
import { createEditorInputOps } from '@whiteboard/editor/input/ops'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorLayout } from '@whiteboard/editor/layout/runtime'
import { createProjectionController } from '@whiteboard/editor/projection/controller'
import { createGraphRead } from '@whiteboard/editor/read/graph'
import { createEditorRead } from '@whiteboard/editor/read/public'
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
  const sessionRead = createSessionRead(session)
  const write = createEditorWrite({
    engine,
    history,
    document,
    projection: graph,
    layout
  })
  const context = createEditorCommandContext({
    engine,
    document,
    graph,
    session,
    sessionRead,
    layout,
    write
  })
  let runner: ReturnType<typeof createEditorCommandRunner<EditorCommandContext>>
  const tasks = createEditorCommandTaskRuntime({
    execute: (command) => {
      if (!runner) {
        throw new Error('Editor command runner is not ready.')
      }

      runner.execute(command)
    }
  })
  runner = createEditorCommandRunner({
    controller: projection,
    context,
    tasks
  })
  const commands = createEditorActionCommands({
    document,
    session,
    graph,
    layout,
    write,
    registry,
    defaults: defaults.templates
  })
  const actions = createEditorActions({
    runner,
    commands
  })
  const ops = createEditorInputOps({
    document,
    graph,
    registry,
    session,
    write
  })
  const host = createEditorHost({
    engine,
    document,
    projection: graph,
    sessionRead,
    session,
    layout,
    write,
    ops,
    runner
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
      graph,
      sessionRead,
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
      host.cancel()
      runner.dispose()
      projection.dispose()
      session.reset()
      layout.text.clear()
    }
  }
}
