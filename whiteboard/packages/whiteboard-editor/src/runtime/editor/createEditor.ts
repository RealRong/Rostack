import type { EngineInstance } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { DrawPreferences } from '../../types/draw'
import type {
  Editor
} from '../../types/editor'
import {
  createInteractionRuntime,
  createSnapRuntime
} from '../interaction'
import type { InteractionContext } from '../../interactions/context'
import type { InteractionBinding } from '../interaction/types'
import { createViewport } from '../viewport'
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
  initialDrawPreferences,
  initialViewport,
  registry,
}: {
  engine: EngineInstance
  initialTool: Tool
  initialDrawPreferences: DrawPreferences
  initialViewport: Viewport
  registry: NodeRegistry
}): Editor => {
  const runtime = createRuntimeState({
    initialTool,
    initialDrawPreferences
  })
  const viewport = createViewport({
    initialViewport
  })
  let interactions: readonly InteractionBinding[] = []
  const interaction = createInteractionRuntime({
    getViewport: () => viewport.input,
    getBindings: () => interactions,
    space: runtime.state.space
  })
  const overlay = createOverlay({
    viewport: viewport.read,
    gesture: interaction.gesture
  })
  const readBundle = createRead({
    engineRead: engine.read,
    registry,
    history: engine.history,
    runtime,
    interaction,
    overlay,
    viewport
  })
  const read = readBundle.read
  const write = createEditorWrite({
    engine,
    read,
    runtime,
    overlay,
    viewport
  })
  const snap = createSnapRuntime({
    readZoom: () => viewport.read.get().zoom,
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
  const state = createEditorState({
    interaction,
    runtime,
    viewport: viewport.read
  })
  const commands = createEditorCommands({
    engine,
    read,
    write,
    viewport: viewport.read,
    selection: state.selection
  })

  const interactionContext: InteractionContext = {
    read,
    selection: readBundle.internal.selection,
    write,
    config: engine.config,
    snap
  }
  const edgeHover = createEdgeHoverService(interactionContext)

  interactions = createEditorInteractions(interactionContext)
  const input = createEditorInput({
    interaction,
    edgeHover,
    read,
    write,
    selection: state.selection
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
