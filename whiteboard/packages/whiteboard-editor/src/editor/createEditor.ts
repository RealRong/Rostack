import type { Engine } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '@whiteboard/editor/local/draw/state'
import type { Editor } from '@whiteboard/editor/types/editor'
import { createSnapRuntime } from '@whiteboard/editor/input/core'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import { createEditorInteractions } from '@whiteboard/editor/input'
import { createEdgeHoverService } from '@whiteboard/editor/input/edge/hover'
import { createLocalRuntime } from '@whiteboard/editor/local/runtime'
import { createQueryRuntime } from '@whiteboard/editor/query'
import { createCommandRuntime } from '@whiteboard/editor/command'
import { createEditorInput } from '@whiteboard/editor/editor/input'
import { createEditorFacade } from '@whiteboard/editor/editor/facade'
import { createLayoutRuntime } from '@whiteboard/editor/layout/runtime'
import type { LayoutBackend } from '@whiteboard/editor/types/layout'

export const createEditor = ({
  engine,
  initialTool,
  initialDrawState = DEFAULT_DRAW_STATE,
  initialViewport,
  registry,
  services,
}: {
  engine: Engine
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
  services?: {
    layout?: LayoutBackend
  }
}): Editor => {
  const local = createLocalRuntime({
    initialTool,
    initialDrawState,
    initialViewport,
    registry
  })
  const query = createQueryRuntime({
    engineRead: engine.read,
    registry,
    history: engine.history,
    local
  })
  local.bindQuery(query.read)
  const layout = createLayoutRuntime({
    read: query.read,
    registry,
    backend: services?.layout
  })
  local.bindLayout(layout)
  const command = createCommandRuntime({
    engine,
    read: query.read,
    local,
    layout
  })
  const snap = createSnapRuntime({
    readZoom: () => local.viewport.read.get().zoom,
    node: {
      config: engine.config.node,
      query: engine.read.index.snap.inRect
    },
    edge: {
      config: engine.config.edge,
      nodeSize: engine.config.nodeSize,
      query: query.read.edge.connectCandidates
    }
  })

  const interactionContext: InteractionContext = {
    query: query.read,
    selection: query.selectionModel,
    command,
    local: local.actions,
    layout,
    config: engine.config,
    snap
  }
  const edgeHover = createEdgeHoverService(interactionContext)

  local.bindInteractions(
    createEditorInteractions(interactionContext)
  )
  const input = createEditorInput({
    interaction: local.interaction,
    edgeHover,
    read: query.read,
    local
  })

  return createEditorFacade({
    engine,
    local,
    query,
    command,
    input
  })
}
