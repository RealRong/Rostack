import {
  createDerivedStore
} from '@whiteboard/engine'
import type { EngineInstance } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import type { DrawPreferences } from '../../types/draw'
import type { InsertPresetCatalog } from '../../types/insert'
import type { Tool } from '../../types/tool'
import type {
  Editor,
  EditorInteractionState
} from '../../types/editor'
import type { EditorInputPolicy } from './types'
import {
  createInteractionRuntime,
  createSnapRuntime
} from '../interaction'
import type { InteractionCtx } from '../interaction/ctx'
import type { InteractionBinding } from '../../types/runtime/interaction'
import { createDrawInteraction } from '../../interactions/draw'
import { createEdgeInteraction } from '../../interactions/edge'
import { createEdgeHoverService } from '../../interactions/edge/hover'
import { createInsertInteraction } from '../../interactions/insert'
import { createMindmapInteraction } from '../../interactions/mindmap'
import { createSelectionInteraction } from '../../interactions/selection'
import { createTransformInteraction } from '../../interactions/transform'
import { createViewportInteraction } from '../../interactions/viewport'
import { createOverlay } from '../overlay'
import { createRead } from '../read'
import { createRuntimeState } from '../state'
import { createClipboard } from '../clipboard'
import { createEditorWrite } from '../write'

export const createEditor = ({
  engine,
  initialTool,
  initialViewport,
  viewportLimits,
  inputPolicy: initialInputPolicy,
  registry,
  insertPresetCatalog,
  initialDrawPreferences
}: {
  engine: EngineInstance
  initialTool: Tool
  initialViewport: Viewport
  viewportLimits: {
    minZoom: number
    maxZoom: number
  }
  inputPolicy: EditorInputPolicy
  registry: NodeRegistry
  insertPresetCatalog: InsertPresetCatalog
  initialDrawPreferences: DrawPreferences
}): Editor => {
  const runtime = createRuntimeState({
    initialTool,
    initialViewport,
    viewportLimits,
    inputPolicy: initialInputPolicy,
    initialDrawPreferences
  })
  let interactions: readonly InteractionBinding[] = []
  const interaction = createInteractionRuntime({
    getViewport: () => runtime.state.viewport.input,
    getBindings: () => interactions,
    space: runtime.state.space
  })
  const overlay = createOverlay({
    viewport: runtime.public.viewport,
    gesture: interaction.gesture
  })
  const read = createRead({
    engineRead: engine.read,
    registry,
    history: engine.history,
    runtime,
    overlay,
    viewport: runtime.public.viewport
  })
  const write = createEditorWrite({
    engine,
    read,
    runtime,
    overlay,
    insertPresetCatalog
  })
  const snap = createSnapRuntime({
    readZoom: () => runtime.public.viewport.get().zoom,
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
  const nodeTextCommands = {
    preview: ({ nodeId, size }) => {
      write.preview.node.text.setSize(nodeId, size)
    },
    clearPreview: (nodeId) => {
      write.preview.node.text.clearSize(nodeId)
    },
    cancel: ({ nodeId }) => {
      write.preview.node.text.clearSize(nodeId)
      write.session.edit.clear()
    },
    commit: write.document.node.text.commit,
    setColor: write.document.node.text.setColor,
    setFontSize: write.document.node.text.setFontSize
  } satisfies Editor['commands']['node']['text']
  const baseCommands = {
    ...engine.commands,
    history: write.document.history,
    tool: write.session.tool,
    draw: write.view.draw,
    edit: write.session.edit,
    selection: write.session.selection,
    viewport: {
      set: write.view.viewport.set,
      panBy: write.view.viewport.panBy,
      zoomTo: write.view.viewport.zoomTo,
      fit: write.view.viewport.fit,
      reset: write.view.viewport.reset,
      setRect: write.view.viewport.setRect,
      setLimits: write.view.viewport.setLimits
    },
    edge: write.document.edge,
    node: {
      ...write.document.node,
      text: nodeTextCommands
    },
    mindmap: write.document.mindmap,
    insert: write.document.insert
  } satisfies Omit<Editor['commands'], 'clipboard'>
  const commands = {
    ...baseCommands,
    clipboard: createClipboard({
      editor: {
        commands: baseCommands,
        read,
        state: runtime.public.state
      }
    })
  } satisfies Editor['commands']

  const interactionState = createDerivedStore<EditorInteractionState>({
    get: (readStore) => {
      const state = readStore(interaction.state)
      const mode = readStore(interaction.mode)

      return {
        busy: state.busy,
        chrome: state.chrome,
        transforming: state.transforming,
        drawing: mode === 'draw',
        panning: mode === 'viewport-pan',
        selecting:
          mode === 'press'
          || mode === 'marquee'
          || mode === 'node-drag'
          || mode === 'mindmap-drag'
          || mode === 'node-transform',
        editingEdge:
          mode === 'edge-drag'
          || mode === 'edge-connect'
          || mode === 'edge-route',
        space: readStore(runtime.state.space)
      }
    },
    isEqual: (left, right) => (
      left.busy === right.busy
      && left.chrome === right.chrome
      && left.transforming === right.transforming
      && left.drawing === right.drawing
      && left.panning === right.panning
      && left.selecting === right.selecting
      && left.editingEdge === right.editingEdge
      && left.space === right.space
    )
  })
  const state = {
    ...runtime.public.state,
    interaction: interactionState
  } satisfies Editor['state']

  const interactionCtx: InteractionCtx = {
    read,
    write,
    config: engine.config,
    snap
  }
  const viewportInteraction = createViewportInteraction(interactionCtx)
  const insertInteraction = createInsertInteraction(interactionCtx)
  const drawInteraction = createDrawInteraction(interactionCtx)
  const transformInteraction = createTransformInteraction(interactionCtx)
  const mindmapInteraction = createMindmapInteraction(interactionCtx)
  const selectionInteraction = createSelectionInteraction(interactionCtx)
  const edgeInteraction = createEdgeInteraction(interactionCtx)
  const edgeHover = createEdgeHoverService(interactionCtx)

  interactions = [
    viewportInteraction,
    insertInteraction,
    drawInteraction,
    edgeInteraction,
    transformInteraction,
    mindmapInteraction,
    selectionInteraction
  ]

  const writePointer = (input: {
    client: { x: number, y: number }
    screen: { x: number, y: number }
    world: { x: number, y: number }
  }) => {
    write.view.pointer.set({
      client: input.client,
      screen: input.screen,
      world: input.world
    })
  }

  const clearPointer = () => {
    write.view.pointer.clear()
  }

  const input: Editor['input'] = {
    cancel: () => {
      clearPointer()
      edgeHover.clear()
      interaction.cancel()
    },
    pointerDown: (input) => {
      writePointer(input)

      const handled = interaction.handlePointerDown(input)
      if (handled) {
        edgeHover.clear()
      }
      return {
        handled,
        continuePointer: handled && interaction.busy.get()
      }
    },
    pointerMove: (input) => {
      writePointer(input)
      const handled = interaction.handlePointerMove(input)
      if (!handled) {
        edgeHover.move(input.world)
      }
      return handled
    },
    pointerUp: (input) => {
      writePointer(input)
      return interaction.handlePointerUp(input)
    },
    pointerCancel: (input) => {
      clearPointer()
      edgeHover.clear()
      return interaction.handlePointerCancel(input)
    },
    pointerLeave: () => {
      clearPointer()
      edgeHover.clear()
      interaction.handlePointerLeave()
    },
    wheel: (input) => {
      const policy = runtime.state.inputPolicy.get()
      if (!policy.wheelEnabled) {
        return false
      }

      writePointer(input)

      if (interaction.handleWheel(input)) {
        return true
      }

      write.view.viewport.wheel(
        {
          deltaX: input.deltaX,
          deltaY: input.deltaY,
          ctrlKey: input.modifiers.ctrl,
          metaKey: input.modifiers.meta,
          clientX: input.client.x,
          clientY: input.client.y
        },
        policy.wheelSensitivity
      )
      return true
    },
    keyDown: (input) => interaction.handleKeyDown(input),
    keyUp: (input) => interaction.handleKeyUp(input),
    blur: () => {
      clearPointer()
      edgeHover.clear()
      interaction.handleBlur()
    }
  }

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
      write.session.tool.set(config.tool)

      write.view.viewport.setLimits(config.viewport)
      write.view.inputPolicy.set({
        panEnabled: config.viewport.enablePan,
        wheelEnabled: config.viewport.enableWheel,
        wheelSensitivity: config.viewport.wheelSensitivity
      })
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
