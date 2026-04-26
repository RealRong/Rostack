import type { Engine } from '@whiteboard/engine'
import type { EditorDocumentRuntimeSource } from '@whiteboard/editor/document/source'
import type { EditorInputHost } from '@whiteboard/editor/types/editor'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import { createSnapRuntime, type SnapRuntime } from '@whiteboard/editor/input/core/snap'
import {
  createEdgeHoverService
} from '@whiteboard/editor/input/hover/edge'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import {
  createEditorInputHost
} from '@whiteboard/editor/input/host'
import type { EditorSceneRuntime } from '@whiteboard/editor/scene/source'
import {
  createSessionRead,
  type SessionRead
} from '@whiteboard/editor/session/read'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorSessionSource } from '@whiteboard/editor/types/editor'
import type { ToolService } from '@whiteboard/editor/services/tool'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { NodeRegistry, NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write/types'

export type EditorHostDeps = {
  engine: Engine
  document: EditorDocumentRuntimeSource
  projection: EditorSceneRuntime
  sessionRead: SessionRead
  session: EditorSession
  sessionSource: EditorSessionSource
  layout: EditorLayout
  write: EditorWrite
  tool: ToolService
  registry: NodeRegistry
  nodeType: NodeTypeSupport
  snap: SnapRuntime
}

const createEditorSnapRuntime = ({
  engine,
  projection,
  session
}: {
  engine: Engine
  projection: EditorSceneRuntime
  session: Pick<EditorSession, 'viewport'>
}) => createSnapRuntime({
  readZoom: () => session.viewport.read.get().zoom,
  node: {
    config: engine.config.node,
    query: projection.query.snap
  },
  edge: {
    config: engine.config.edge,
    nodeSize: engine.config.nodeSize,
    query: projection.query.edge.connectCandidates
  }
})

export const createEditorHost = ({
  engine,
  document,
  projection,
  session,
  sessionSource,
  layout,
  write,
  tool,
  registry,
  nodeType
}: Omit<EditorHostDeps, 'snap' | 'sessionRead'>): EditorInputHost => {
  const sessionRead = createSessionRead(session)
  const snap = createEditorSnapRuntime({
    engine,
    projection,
    session
  })
  const deps: EditorHostDeps = {
    engine,
    document,
    projection,
    sessionRead,
    session,
    sessionSource,
    layout,
    write,
    tool,
    registry,
    nodeType,
    snap
  }
  const interaction = createInteractionRuntime({
    getViewport: () => session.viewport.input,
    getBindings: () => ([
      createViewportBinding(deps),
      createDrawBinding(deps),
      createEdgeBinding(deps),
      createTransformBinding(deps),
      createSelectionBinding(deps)
    ]),
    state: {
      ...session.interaction.write,
      getSpace: session.interaction.read.space.get
    }
  })
  const edgeHover = createEdgeHoverService(
    {
      readTool: session.state.tool.get,
      snap
    },
    session.interaction.write
  )
  const host = createEditorInputHost({
    interaction,
    edgeHover,
    projection,
    session
  })

  return host
}
