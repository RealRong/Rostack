import type { HistoryPort } from '@shared/mutation'
import type { Viewport } from '@whiteboard/core/types'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import { createEditorActionsApi } from '@whiteboard/editor/action'
import { createEditorDerived } from '@whiteboard/editor/editor/derived'
import { createEditorEvents } from '@whiteboard/editor/editor/events'
import { createEditorState } from '@whiteboard/editor/editor/state'
import { createEditorHost } from '@whiteboard/editor/input/runtime'
import { createRuntime as createSceneRuntime } from '@whiteboard/editor-scene'
import { createEditorSceneBinding } from '@whiteboard/editor/scene/binding'
import { createToolService } from '@whiteboard/editor/services/tool'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/session/draw/state'
import { createEditorSession } from '@whiteboard/editor/session/runtime'
import { createEditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { Editor } from '@whiteboard/editor/types/editor'
import {
  DEFAULT_EDITOR_DEFAULTS,
  type EditorDefaults
} from '@whiteboard/editor/types/defaults'
import {
  createNodeTypeSupport,
  type NodeSpec
} from '@whiteboard/editor/types/node'
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
    layout: WhiteboardLayoutService
    defaults?: EditorDefaults
  }
}): Editor => {
  const session = createEditorSession({
    initialTool: input.initialTool,
    initialDrawState: input.initialDrawState ?? DEFAULT_DRAW_STATE,
    initialViewport: input.initialViewport
  })
  const layout = input.services?.layout
  if (!layout) {
    throw new Error('Whiteboard layout service is required.')
  }
  const defaults = input.services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const nodeType = createNodeTypeSupport(input.nodes)

  const sceneBinding = createEditorSceneBinding({
    engine: input.engine,
    session
  })
  const sceneRuntime = createSceneRuntime({
    source: sceneBinding,
    layout,
    nodeCapability: {
      meta: nodeType.meta,
      edit: nodeType.edit,
      capability: (node) => resolveNodeEditorCapability(node, nodeType)
    }
  })
  const scene = sceneRuntime.scene
  const document = scene.document

  const state = createEditorState(session)

  const writeRuntime = createEditorWrite({
    engine: input.engine,
    history: input.history,
    document,
    projection: scene
  })
  const tool = createToolService({
    session
  })
  const tasks = createEditorTaskRuntime()

  const actions = createEditorActionsApi({
    document,
    state,
    session,
    graph: scene,
    tasks,
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
    layout,
    write: writeRuntime,
    tool,
    nodeType
  })
  const events = createEditorEvents({
    engine: input.engine,
    session,
    document,
    resetHost: host.cancel
  })

  return {
    document,
    scene,
    state,
    derived,
    history: input.history,
    input: host,
    write: actions,
    events: events.events,
    dispatch: session.dispatch,
    dispose: () => {
      events.dispose()
      tasks.dispose()
      host.cancel()
      sceneRuntime.dispose()
      sceneBinding.dispose()
      session.dispose()
      session.reset()
    }
  }
}
