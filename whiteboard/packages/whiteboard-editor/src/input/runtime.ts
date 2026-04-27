import type { Engine } from '@whiteboard/engine'
import type { DocumentQuery } from '@whiteboard/editor-scene'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import { createSnapRuntime, type SnapRuntime } from '@whiteboard/editor/input/core/snap'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import { createEdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import type { TextLayoutMeasure } from '@whiteboard/editor/layout/textLayout'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ToolService } from '@whiteboard/editor/services/tool'
import type {
  EditorInputHost,
  EditorSceneApi,
  EditorSceneDerived,
  EditorState
} from '@whiteboard/editor/types/editor'
import type { NodeRegistry, NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write/types'

type SessionRead = {
  tool: EditorState['tool']
  draw: EditorState['draw']
  space: {
    get: () => boolean
  }
  viewport: EditorState['viewport']
}

const createSessionRead = (
  state: EditorState
): SessionRead => ({
  tool: state.tool,
  draw: state.draw,
  space: {
    get: () => state.interaction.get().space
  },
  viewport: state.viewport
})

export type EditorHostDeps = {
  engine: Engine
  document: DocumentQuery
  projection: EditorSceneApi
  state: EditorState
  sessionRead: SessionRead
  session: EditorSession
  sceneDerived: EditorSceneDerived
  measure: TextLayoutMeasure
  registry: Pick<NodeRegistry, 'get'>
  write: EditorWrite
  tool: ToolService
  nodeType: NodeTypeSupport
  snap: SnapRuntime
}

const createEditorSnapRuntime = (input: {
  engine: Engine
  projection: EditorSceneApi
  state: Pick<EditorState, 'viewport'>
}) => createSnapRuntime({
  readZoom: () => input.state.viewport.get().zoom,
  node: {
    config: input.engine.config.node,
    query: input.projection.query.snap
  },
  edge: {
    config: input.engine.config.edge,
    query: input.projection.query.edge.connectCandidates
  }
})

export const createEditorHost = (input: {
  engine: Engine
  document: DocumentQuery
  projection: EditorSceneApi
  state: EditorState
  session: EditorSession
  sceneDerived: EditorSceneDerived
  measure: TextLayoutMeasure
  registry: Pick<NodeRegistry, 'get'>
  write: EditorWrite
  tool: ToolService
  nodeType: NodeTypeSupport
}): EditorInputHost => {
  const sessionRead = createSessionRead(input.state)
  const snap = createEditorSnapRuntime({
    engine: input.engine,
    projection: input.projection,
    state: input.state
  })
  const deps: EditorHostDeps = {
    engine: input.engine,
    document: input.document,
    projection: input.projection,
    state: input.state,
    sessionRead,
    session: input.session,
    sceneDerived: input.sceneDerived,
    measure: input.measure,
    registry: input.registry,
    write: input.write,
    tool: input.tool,
    nodeType: input.nodeType,
    snap
  }

  const interaction = createInteractionRuntime({
    getViewport: () => input.session.viewport.input,
    getBindings: () => ([
      createViewportBinding(deps),
      createDrawBinding(deps),
      createEdgeBinding(deps),
      createTransformBinding(deps),
      createSelectionBinding(deps)
    ]),
    state: {
      ...input.session.interaction.write,
      getSpace: () => input.state.interaction.get().space
    }
  })

  const edgeHover = createEdgeHoverService(
    {
      readTool: input.session.state.tool.get,
      snap
    },
    input.session.interaction.write
  )

  return createEditorInputHost({
    interaction,
    edgeHover,
    projection: input.projection,
    session: input.session
  })
}
