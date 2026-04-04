import type { EngineInstance } from '@whiteboard/engine'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type {
  Editor
} from '../../types/editor'
import {
  createInteractionRuntime,
  createSnapRuntime
} from '../interaction'
import type { InteractionContext } from '../../interactions/context'
import type { EditorHost } from '../../host/types'
import type { InteractionBinding } from '../interaction/types'
import { createEditorInteractions } from '../../interactions'
import { createEdgeHoverService } from '../../interactions/edge/hover'
import { createOverlay } from '../overlay'
import { createRead } from '../read'
import { createRuntimeState } from '../state'
import { createEditorCommands } from './commands'
import { createEditorInput } from './input'
import { createEditorState } from './state'
import { createEditorWrite } from '../write'

export const createEditor = ({
  engine,
  initialTool,
  registry,
  host
}: {
  engine: EngineInstance
  initialTool: Tool
  registry: NodeRegistry
  host: EditorHost
}): Editor => {
  const runtime = createRuntimeState({
    initialTool
  })
  let interactions: readonly InteractionBinding[] = []
  const interaction = createInteractionRuntime({
    getViewport: () => host.viewport.input,
    getBindings: () => interactions,
    space: runtime.state.space
  })
  const overlay = createOverlay({
    viewport: host.viewport.read,
    gesture: interaction.gesture
  })
  const read = createRead({
    engineRead: engine.read,
    registry,
    history: engine.history,
    runtime,
    overlay,
    host
  })
  const write = createEditorWrite({
    engine,
    read,
    runtime,
    overlay,
    host
  })
  const snap = createSnapRuntime({
    readZoom: () => host.viewport.read.get().zoom,
    node: {
      config: engine.config.node,
      query: engine.read.index.snap.inRect
    },
    edge: {
      config: engine.config.edge,
      nodeSize: engine.config.nodeSize,
      query: read.edge.connectCandidates
    }
  })
  const commands = createEditorCommands({
    engine,
    read,
    write,
    runtime,
    host
  })
  const state = createEditorState({
    interaction,
    runtime,
    host
  })

  const interactionContext: InteractionContext = {
    read,
    write,
    config: engine.config,
    snap
  }
  const edgeHover = createEdgeHoverService(interactionContext)

  interactions = createEditorInteractions(interactionContext)
  const input = createEditorInput({
    interaction,
    edgeHover,
    host,
    write
  })

  const resetRuntimeState = () => {
    input.cancel()
    overlay.reset()
    runtime.resetLocal()
  }

  const unsubscribeCommit = engine.commit.subscribe(() => {
    const commit = engine.commit.get()
    if (!commit) {
      return
    }

    if (commit.kind === 'replace') {
      resetRuntimeState()
      return
    }

    runtime.reconcileAfterCommit(read)
  })

  const editor = {
    read,
    state,
    write,
    commands,
    input,
    configure: (config) => {
      engine.configure({
        mindmapLayout: config.mindmapLayout,
        history: config.history
      })
    },
    dispose: () => {
      unsubscribeCommit()
      resetRuntimeState()
      engine.dispose()
    }
  } satisfies Editor

  return editor
}
