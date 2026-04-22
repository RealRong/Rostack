import type { Engine } from '@whiteboard/engine'
import type { EditorActions } from '@whiteboard/editor/action/types'
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
import { createEditorInputHost } from '@whiteboard/editor/input/host'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorWrite } from '@whiteboard/editor/write/types'
import type { CommittedRead } from '@whiteboard/editor/committed/read'

export type EditorHostDeps = {
  engine: Engine
  committed: CommittedRead
  session: EditorSession
  query: EditorQuery
  layout: EditorLayout
  write: EditorWrite
  actions: EditorActions
  snap: SnapRuntime
}

const createEditorSnapRuntime = ({
  engine,
  committed,
  query
}: {
  engine: Engine
  committed: CommittedRead
  query: EditorQuery
}) => createSnapRuntime({
  readZoom: () => query.viewport.get().zoom,
  node: {
    config: engine.config.node,
    query: committed.index.snap.inRect
  },
  edge: {
    config: engine.config.edge,
    nodeSize: engine.config.nodeSize,
    query: query.edge.connectCandidates
  }
})

export const createEditorHost = ({
  engine,
  committed,
  session,
  query,
  layout,
  write,
  actions
}: Omit<EditorHostDeps, 'snap'>): EditorInputHost => {
  const snap = createEditorSnapRuntime({
    engine,
    committed,
    query
  })
  const deps: EditorHostDeps = {
    engine,
    committed,
    session,
    query,
    layout,
    write,
    actions,
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
      query,
      snap
    },
    session.interaction.write
  )

  return createEditorInputHost({
    interaction,
    edgeHover,
    query,
    session,
    actions
  })
}
