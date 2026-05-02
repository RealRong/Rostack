import { createMutationDelta } from '@shared/mutation'
import type { HistoryPort } from '@shared/mutation'
import { whiteboardMutationModel } from '@whiteboard/core/mutation'
import type { Viewport } from '@whiteboard/core/types'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import { createEditorActionsApi } from '@whiteboard/editor/actions'
import {
  createEditorSceneFacade,
  createEditorSceneUi
} from '@whiteboard/editor/scene-ui'
import {
  createEditorStateStores,
  createEditorStateView
} from '@whiteboard/editor/scene-ui/state'
import { createSnapRuntime } from '@whiteboard/editor/input/core/snap'
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import { createProjectionRuntime } from '@whiteboard/editor-scene'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/schema/draw-state'
import {
  createEditorStateRuntime
} from '@whiteboard/editor/state/runtime'
import type {
  EditorDispatchInput
} from '@whiteboard/editor/state/intents'
import {
  createEditorViewport
} from '@whiteboard/editor/state/viewport'
import {
  editorStateMutationModel
} from '@whiteboard/editor/state/model'
import { attachEditorSync } from '@whiteboard/editor/editor/sync'
import { createEditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { Editor } from '@whiteboard/editor/api/editor'
import {
  DEFAULT_EDITOR_DEFAULTS,
  type EditorDefaults
} from '@whiteboard/editor/schema/defaults'
import {
  createNodeTypeSupport,
  type NodeSpec
} from '@whiteboard/editor/node'
import type { Tool } from '@whiteboard/editor/schema/tool'
import { createEditorWrite } from '@whiteboard/editor/write'
import type { IntentResult } from '@whiteboard/engine'
import type { Engine } from '@whiteboard/engine'
import type { WhiteboardMutationDelta } from '@whiteboard/engine/mutation'

const BOOTSTRAP_DOCUMENT_DELTA: WhiteboardMutationDelta = createMutationDelta(
  whiteboardMutationModel,
  {
    reset: true
  }
)

const BOOTSTRAP_EDITOR_DELTA = createMutationDelta(
  editorStateMutationModel,
  {
    reset: true
  }
)

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
  const layout = input.services?.layout
  if (!layout) {
    throw new Error('Whiteboard layout service is required.')
  }

  const defaults = input.services?.defaults ?? DEFAULT_EDITOR_DEFAULTS
  const nodeType = createNodeTypeSupport(input.nodes)
  const state = createEditorStateRuntime({
    initialTool: input.initialTool,
    initialDrawState: input.initialDrawState ?? DEFAULT_DRAW_STATE
  })
  const viewport = createEditorViewport({
    initialViewport: input.initialViewport,
    commit: () => {}
  })
  const tasks = createEditorTaskRuntime()
  const stateStores = createEditorStateStores({
    state,
    viewport
  })
  const editorState = createEditorStateView({
    stores: stateStores,
    viewport
  })

  const sceneRuntime = createProjectionRuntime({
    layout,
    nodeCapability: {
      meta: nodeType.meta,
      edit: nodeType.edit,
      capability: nodeType.support
    },
    view: () => ({
      zoom: viewport.get().zoom,
      center: viewport.get().center,
      worldRect: viewport.visibleWorldRect()
    })
  })

  sceneRuntime.update({
    document: {
      snapshot: input.engine.doc(),
      rev: input.engine.rev(),
      delta: BOOTSTRAP_DOCUMENT_DELTA
    },
    editor: {
      snapshot: state.snapshot(),
      delta: BOOTSTRAP_EDITOR_DELTA
    }
  })

  const projection = createEditorSceneUi({
    scene: sceneRuntime.scene,
    state: editorState,
    viewport,
    nodeType,
    defaults: defaults.selection
  })
  const scene = createEditorSceneFacade({
    projection,
    state: editorState,
    capture: sceneRuntime.capture
  })
  const document = projection.document
  const snap = createSnapRuntime({
    readZoom: () => viewport.get().zoom,
    node: {
      config: input.engine.config.node,
      query: projection.snap.candidates
    },
    edge: {
      config: input.engine.config.edge,
      query: projection.edges.connectCandidates
    }
  })
  const write = createEditorWrite({
    engine: input.engine,
    history: input.history,
    document,
    projection
  })

  const actions = createEditorActionsApi({
    document,
    projection,
    editor: {
      tool: {
        get: () => state.snapshot().state.tool
      },
      draw: {
        get: () => state.snapshot().state.draw
      },
      edit: {
        get: () => state.snapshot().state.edit
      },
      selection: {
        get: () => state.snapshot().state.selection
      },
      preview: {
        get: () => state.snapshot().preview
      },
      state: {
        write: state.write
      },
      dispatch: state.dispatch,
      viewport
    },
    tasks,
    write,
    nodeType,
    defaults: defaults.templates
  })

  const runtime = {
    config: input.engine.config,
    nodeType,
    snap
  }

  const dispatch: Editor['dispatch'] = (command) => {
    state.dispatch(command as EditorDispatchInput)
  }

  const editorBase = {
    scene,
    document,
    actions,
    write,
    state: {
      snapshot: state.snapshot,
      reader: state.reader,
      write: state.write,
      commits: state.commits
    },
    viewport,
    read: state.snapshot,
    runtime,
    dispatch
  }
  const host = createEditorInputHost({
    editor: {
      ...editorBase,
      input: null as never,
      dispose: () => {}
    },
    layout
  })

  const detachSync = attachEditorSync({
    engine: input.engine,
    state,
    scene: sceneRuntime,
    document,
    cancelInput: host.cancel
  })

  return {
    ...editorBase,
    input: host,
    dispose: () => {
      detachSync()
      tasks.dispose()
      host.cancel()
      sceneRuntime.dispose()
      state.dispose()
    }
  }
}
