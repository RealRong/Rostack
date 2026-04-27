import type { HistoryPort } from '@shared/mutation'
import type { Viewport } from '@whiteboard/core/types'
import { createEditorActionsApi } from '@whiteboard/editor/action'
import { createEditorBoundaryRuntime } from '@whiteboard/editor/boundary/runtime'
import { createEditorBoundaryTaskRuntime } from '@whiteboard/editor/boundary/task'
import { createEditorDerived } from '@whiteboard/editor/editor/derived'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorState } from '@whiteboard/editor/editor/state'
import { createEditorInputApi } from '@whiteboard/editor/input/host'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createEditorTextLayout } from '@whiteboard/editor/layout/textLayout'
import { createEditorSceneRuntime } from '@whiteboard/editor-scene'
import { createEditorSceneApi } from '@whiteboard/editor/scene/api'
import { createEditorSceneBinding } from '@whiteboard/editor/scene/binding'
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
import {
  createNodeTypeSupport,
  type NodeSpec,
  type NodeSpecReader
} from '@whiteboard/editor/types/node'
import { compileNodeSpec } from '@whiteboard/editor/types/node/compile'
import { resolveNodeEditorCapability } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import { createEditorWrite } from '@whiteboard/editor/write'
import type { IntentResult } from '@whiteboard/engine'
import type { Engine } from '@whiteboard/engine'

export const createEditor = (input: {
  engine: Engine
  history: HistoryPort<IntentResult>
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  nodes: NodeSpec
  services?: {
    layout?: LayoutBackend
    defaults?: EditorDefaults
  }
}): Editor => {
  const session = createEditorSession({
    initialTool: input.initialTool,
    initialDrawState: input.initialDrawState ?? DEFAULT_DRAW_STATE,
    initialViewport: input.initialViewport
  })
  const compiledNodes = compileNodeSpec(input.nodes)
  const nodeReader: NodeSpecReader = {
    get: (type) => compiledNodes.entryByType.resolve(type)
  }
  const textLayout = createEditorTextLayout({
    nodes: nodeReader,
    backend: input.services?.layout
  })
  const defaults = input.services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const nodeType = createNodeTypeSupport(input.nodes)

  const sceneBinding = createEditorSceneBinding({
    engine: input.engine,
    session
  })
  const sceneRuntime = createEditorSceneRuntime({
    source: sceneBinding,
    measure: textLayout.measure,
    nodeCapability: {
      meta: nodeType.meta,
      edit: nodeType.edit,
      capability: (node) => resolveNodeEditorCapability(node, nodeType)
    }
  })
  const scene = createEditorSceneApi({
    runtime: sceneRuntime
  })
  const document = scene.query.document

  const state = createEditorState(session)

  const writeRuntime = createEditorWrite({
    engine: input.engine,
    history: input.history,
    document,
    projection: scene,
    nodes: nodeReader,
    measure: textLayout.measure
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
    scene: {
      current: () => ({
        revision: sceneRuntime.revision(),
        state: sceneRuntime.state()
      }),
      publish: (change) => {
        sceneBinding.emit(change)
      }
    },
    tasks
  })

  const actions = createEditorActionsApi({
    boundary,
    engine: input.engine,
    document,
    state,
    session,
    graph: scene,
    tool,
    write: writeRuntime,
    nodeType,
    defaults: defaults.templates
  })

  const derived = createEditorDerived({
    scene,
    state,
    nodeType,
    defaults: defaults.selection
  })

  const host = createEditorHost({
    engine: input.engine,
    document,
    projection: scene,
    state,
    session,
    sceneDerived: derived.scene,
    measure: textLayout.measure,
    nodes: nodeReader,
    write: writeRuntime,
    tool,
    nodeType
  })
  const inputApi = createEditorInputApi({
    boundary,
    host
  })
  const events = createEditorEvents({
    engine: input.engine,
    session,
    document,
    resetHost: inputApi.cancel
  })

  return {
    document,
    scene,
    state,
    derived,
    history: input.history,
    input: inputApi,
    write: actions,
    events: events.events,
    dispose: () => {
      events.dispose()
      host.cancel()
      boundary.dispose()
      scene.dispose()
      sceneRuntime.dispose()
      sceneBinding.dispose()
      session.reset()
      textLayout.text.clear()
    }
  }
}
