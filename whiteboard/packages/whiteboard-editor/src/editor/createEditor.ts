import type { Engine } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '../types/node'
import type { Tool } from '../types/tool'
import {
  DEFAULT_DRAW_STATE,
  type DrawState
} from '../local/draw/state'
import type { Editor } from '../types/editor'
import { createSnapRuntime } from '../input/core'
import type { InteractionContext } from '../input/context'
import { createEditorInteractions } from '../input'
import { createEdgeHoverService } from '../input/edge/hover'
import { createLocalRuntime } from '../local/runtime'
import { createQueryRuntime } from '../query'
import { createCommandRuntime } from '../command'
import { createEditorInput } from './input'
import { createEditorFacade } from './facade'

export const createEditor = ({
  engine,
  initialTool,
  initialDrawState = DEFAULT_DRAW_STATE,
  initialViewport,
  registry,
}: {
  engine: Engine
  initialTool: Tool
  initialDrawState?: DrawState
  initialViewport: Viewport
  registry: NodeRegistry
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
  const command = createCommandRuntime({
    engine,
    read: query.read,
    local
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
