import { createDerivedStore, read as readValue } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { DrawPreferences } from '../../types/draw'
import type { Editor } from '../../types/editor'
import {
  drawTool,
  edgeTool,
  handTool,
  insertTool,
  selectTool
} from '../../tool/model'
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
import { createEditorStateController } from '../state'
import { createEditorInput } from './input'
import { createEditorState } from './state'
import { createEditorCommands } from '../commands'

export const createEditor = ({
  engine,
  initialTool,
  initialDrawPreferences,
  initialViewport,
  registry,
}: {
  engine: Engine
  initialTool: Tool
  initialDrawPreferences: DrawPreferences
  initialViewport: Viewport
  registry: NodeRegistry
}): Editor => {
  const runtime = createEditorStateController({
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
  const state = createEditorState({
    interaction,
    runtime,
    viewport: viewport.read
  })
  const write = createEditorCommands({
    engine,
    read,
    registry,
    runtime,
    overlay,
    viewport,
    state
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

  const interactionContext: InteractionContext = {
    read,
    selection: readBundle.selectionModel,
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

  const {
    replace: replaceDocument
  } = write.document
  const chrome = createDerivedStore({
    get: () => ({
      marquee: readValue(read.overlay.feedback.marquee),
      draw: readValue(read.overlay.feedback.draw),
      edgeGuide: readValue(read.overlay.feedback.edgeGuide),
      snap: readValue(read.overlay.feedback.snap),
      selection: readValue(read.selection.overlay)
    }),
    isEqual: (left, right) => (
      left.marquee === right.marquee
      && left.draw === right.draw
      && left.edgeGuide === right.edgeGuide
      && left.snap === right.snap
      && left.selection === right.selection
    )
  })
  const panel = createDerivedStore({
    get: () => ({
      nodeToolbar: readValue(read.selection.nodeToolbar),
      edgeToolbar: readValue(read.edge.toolbar),
      history: readValue(read.history),
      draw: readValue(read.draw)
    }),
    isEqual: (left, right) => (
      left.nodeToolbar === right.nodeToolbar
      && left.edgeToolbar === right.edgeToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })
  const disposeListeners = new Set<() => void>()
  const dispose = () => {
    unsubscribeCommit()
    resetRuntimeState()
    Array.from(disposeListeners).forEach(listener => listener())
    disposeListeners.clear()
    engine.dispose()
  }

  const editor = {
    store: state,
    read: {
      ...read,
      chrome,
      panel,
      selectionModel: readBundle.selectionModel
    },
    actions: {
      app: {
        reset: resetRuntimeState,
        replace: replaceDocument,
        export: () => engine.document.get(),
        configure: (config) => {
          engine.configure({
            mindmapLayout: config.mindmapLayout,
            history: config.history
          })
        },
        dispose
      },
      tool: {
        set: write.session.tool.set,
        select: () => {
          write.session.tool.set(selectTool())
        },
        draw: (kind) => {
          write.session.tool.set(drawTool(kind))
        },
        edge: (preset) => {
          write.session.tool.set(edgeTool(preset))
        },
        insert: (preset) => {
          write.session.tool.set(insertTool(preset))
        },
        hand: () => {
          write.session.tool.set(handTool())
        }
      },
      viewport: {
        set: write.view.viewport.set,
        panBy: write.view.viewport.panBy,
        zoomTo: write.view.viewport.zoomTo,
        fit: write.view.viewport.fit,
        reset: write.view.viewport.reset,
        setRect: write.view.viewport.setRect,
        setLimits: write.view.viewport.setLimits
      },
      draw: write.view.draw,
      selection: {
        replace: write.session.selection.replace,
        add: write.session.selection.add,
        remove: write.session.selection.remove,
        toggle: write.session.selection.toggle,
        selectAll: write.session.selection.selectAll,
        clear: write.session.selection.clear,
        frame: write.selection.frame,
        order: write.selection.order,
        group: write.selection.group,
        ungroup: write.selection.ungroup,
        delete: write.selection.delete,
        duplicate: write.selection.duplicate
      },
      edit: {
        ...write.session.edit,
        cancel: write.edit.cancel,
        commit: write.edit.commit
      },
      interaction: input,
      node: write.node,
      edge: {
        create: write.edge.create,
        patch: write.edge.patch,
        move: write.edge.move,
        reconnect: write.edge.reconnect,
        delete: write.edge.delete,
        route: write.edge.route,
        label: write.edge.label,
        style: write.edge.style,
        type: write.edge.type,
        textMode: write.edge.textMode
      },
      mindmap: write.mindmap,
      clipboard: write.clipboard,
      history: write.history
    },
    events: {
      change: (listener) => engine.commit.subscribe(() => {
        const commit = engine.commit.get()
        if (!commit) {
          return
        }
        listener(commit.doc, commit)
      }),
      history: (listener) => read.history.subscribe(() => {
        listener(read.history.get())
      }),
      selection: (listener) => state.selection.subscribe(() => {
        listener(state.selection.get())
      }),
      dispose: (listener) => {
        disposeListeners.add(listener)
        return () => {
          disposeListeners.delete(listener)
        }
      }
    }
  } satisfies Editor

  return editor
}
