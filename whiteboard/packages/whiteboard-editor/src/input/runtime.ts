import type { Engine } from '@whiteboard/engine'
import type { DocumentRead } from '@whiteboard/editor/document/read'
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
import type { EditorInputOps } from '@whiteboard/editor/input/ops'
import type { GraphRead } from '@whiteboard/editor/read/graph'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { SessionRead } from '@whiteboard/editor/session/read'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorWrite } from '@whiteboard/editor/write/types'

export type EditorHostDeps = {
  engine: Engine
  document: DocumentRead
  projection: GraphRead
  sessionRead: SessionRead
  session: EditorSession
  layout: EditorLayout
  write: EditorWrite
  ops: EditorInputOps
  snap: SnapRuntime
}

const createEditorSnapRuntime = ({
  engine,
  document,
  projection,
  sessionRead
}: {
  engine: Engine
  document: DocumentRead
  projection: GraphRead
  sessionRead: SessionRead
}) => createSnapRuntime({
  readZoom: () => sessionRead.viewport.get().zoom,
  node: {
    config: engine.config.node,
    query: document.index.snap.inRect
  },
  edge: {
    config: engine.config.edge,
    nodeSize: engine.config.nodeSize,
    query: projection.edge.connectCandidates
  }
})

export const createEditorHost = ({
  engine,
  document,
  projection,
  sessionRead,
  session,
  layout,
  write,
  ops
}: Omit<EditorHostDeps, 'snap'>): EditorInputHost => {
  const snap = createEditorSnapRuntime({
    engine,
    document,
    projection,
    sessionRead
  })
  const deps: EditorHostDeps = {
    engine,
    document,
    projection,
    sessionRead,
    session,
    layout,
    write,
    ops,
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
      sessionRead,
      snap
    },
    session.interaction.write
  )
  const host = createEditorInputHost({
    interaction,
    edgeHover,
    document,
    session,
    ops
  })

  return host
}
