import { createDerivedStore } from '@shared/core'
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
import { createEditorServices } from './services'

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
  const write = createEditorServices({
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
    get: readStore => ({
      marquee: readStore(read.overlay.feedback.marquee),
      draw: readStore(read.overlay.feedback.draw),
      edgeGuide: readStore(read.overlay.feedback.edgeGuide),
      snap: readStore(read.overlay.feedback.snap),
      selection: readStore(read.selection.overlay)
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
    get: readStore => ({
      nodeToolbar: readStore(read.selection.nodeToolbar),
      edgeToolbar: readStore(read.edge.toolbar),
      history: readStore(read.history),
      draw: readStore(read.draw)
    }),
    isEqual: (left, right) => (
      left.nodeToolbar === right.nodeToolbar
      && left.edgeToolbar === right.edgeToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })
  const currentSelection = () => state.selection.get()
  const docSelect = Object.assign(
    () => read.document,
    {
      bounds: read.document.bounds,
      background: () => read.document.background
    }
  )
  const toolSelect = Object.assign(
    () => state.tool,
    {
      is: read.tool.is
    }
  )
  const viewportSelect = Object.assign(
    () => state.viewport,
    {
      pointer: read.viewport.pointer,
      worldToScreen: read.viewport.worldToScreen,
      screenPoint: read.viewport.screenPoint,
      size: read.viewport.size
    }
  )
  const selectionSelect = Object.assign(
    () => state.selection,
    {
      box: () => read.selection.box,
      summary: () => readBundle.selectionModel,
      overlay: () => read.selection.overlay,
      nodeToolbar: () => read.selection.nodeToolbar,
      node: () => read.selection.node
    }
  )

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
    actions: {
      app: {
        reset: resetRuntimeState,
        load: replaceDocument,
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
        pan: write.view.viewport.panBy,
        zoom: write.view.viewport.zoomTo,
        fit: write.view.viewport.fit,
        reset: write.view.viewport.reset,
        rect: write.view.viewport.setRect,
        limits: write.view.viewport.setLimits
      },
      draw: write.view.draw,
      selection: {
        set: write.session.selection.replace,
        add: write.session.selection.add,
        remove: write.session.selection.remove,
        toggle: write.session.selection.toggle,
        all: write.session.selection.selectAll,
        clear: write.session.selection.clear,
        frame: write.selection.frame,
        order: (mode, target = currentSelection()) => (
          write.selection.order(target, mode)
        ),
        group: (options) => write.selection.group(currentSelection(), options),
        ungroup: (options) => write.selection.ungroup(currentSelection(), options),
        delete: (options) => write.selection.delete(currentSelection(), options),
        duplicate: (options) => write.selection.duplicate(currentSelection(), options)
      },
      edit: {
        ...write.session.edit,
        cancel: write.edit.cancel,
        commit: write.edit.commit
      },
      interaction: input,
      node: {
        create: write.node.create,
        patch: write.node.patch,
        move: write.node.move,
        align: write.node.align,
        distribute: write.node.distribute,
        remove: write.node.deleteCascade,
        duplicate: write.node.duplicate,
        lock: write.node.lock.set,
        text: {
          commit: write.node.text.commit,
          color: write.node.text.color,
          size: write.node.text.size,
          weight: write.node.text.weight,
          italic: write.node.text.italic,
          align: write.node.text.align
        },
        style: {
          fill: write.node.style.fill,
          stroke: write.node.style.stroke
        },
        shape: {
          set: write.node.shape.set
        }
      },
      edge: {
        create: write.edge.create,
        patch: write.edge.patch,
        move: write.edge.move,
        reconnect: write.edge.reconnect,
        remove: write.edge.delete,
        route: write.edge.route,
        label: {
          add: write.edgeLabel.add,
          patch: write.edgeLabel.patch,
          remove: write.edgeLabel.remove,
          setText: write.edgeLabel.setText
        }
      },
      mindmap: {
        create: write.mindmap.create,
        remove: write.mindmap.delete,
        insert: write.mindmap.insert,
        move: write.mindmap.moveSubtree,
        removeNode: write.mindmap.removeSubtree,
        clone: write.mindmap.cloneSubtree,
        patchNode: write.mindmap.updateNode,
        insertByPlace: write.mindmap.insertByPlacement,
        moveByDrop: write.mindmap.moveByDrop,
        moveRoot: write.mindmap.moveRoot
      },
      clipboard: write.clipboard,
      history: write.document.history
    },
    select: {
      scene: () => read.scene.list,
      chrome: () => chrome,
      panel: () => panel,
      doc: docSelect,
      history: () => read.history,
      draw: () => state.draw,
      tool: toolSelect,
      viewport: viewportSelect,
      edit: () => state.edit,
      interaction: () => state.interaction,
      selection: selectionSelect,
      group: {
        exactIds: read.group.exactIds,
        nodeIds: read.group.nodeIds,
        edgeIds: read.group.edgeIds
      },
      node: {
        item: () => read.node.item,
        view: () => read.node.view,
        capability: () => read.node.capability,
        bounds: read.node.bounds.get
      },
      edge: {
        item: () => read.edge.item,
        resolved: () => read.edge.resolved,
        view: () => read.edge.view,
        toolbar: () => read.edge.toolbar,
        bounds: read.edge.bounds.get,
        box: read.edge.box
      },
      mindmap: {
        item: () => read.mindmap.item,
        view: () => read.mindmap.view
      }
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
