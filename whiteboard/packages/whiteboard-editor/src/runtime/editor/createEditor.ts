import { createDerivedStore } from '@shared/store'
import { isNodeUpdateEmpty } from '@whiteboard/core/node'
import type { Engine } from '@whiteboard/engine'
import type { EdgePatch, Viewport } from '@whiteboard/core/types'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { DrawPreferences } from '../../types/draw'
import type {
  Editor,
  EditorEdgesApi,
  EditorNodesApi
} from '../../types/editor'
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
import { createRuntimeState } from '../state'
import { createEditorInput } from './input'
import { createEditorState } from './state'
import { createEditorRuntime } from './runtime'
import { createSelectionActions } from '../document/selection'
import { createEdgeLabelActions } from '../document/edge'
import { createClipboardActions } from '../document/clipboard'

const hasEdgePatchContent = (
  patch: EdgePatch
) => Object.keys(patch).length > 0

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
  const write = createEditorRuntime({
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
  const selectionCommands = createSelectionActions({
    read,
    document: write.document,
    session: write.session
  })
  const edgeLabelActions = createEdgeLabelActions({
    read,
    edit: state.edit,
    session: write.session,
    document: write.document
  })
  const clipboardActions = createClipboardActions({
    editor: {
      read,
      document: write.document,
      session: write.session,
      selection: selectionCommands,
      state: {
        viewport: viewport.read,
        selection: state.selection
      }
    }
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

  const patchNodes: EditorNodesApi['patch'] = (
    ids,
    update,
    options
  ) => {
    if (isNodeUpdateEmpty(update)) {
      return undefined
    }

    const updates = ids.flatMap((id) => engine.read.node.item.get(id)
      ? [{
          id,
          update
        }]
      : [])
    if (!updates.length) {
      return undefined
    }

    return write.document.node.updateMany(updates, {
      origin: options?.origin
    })
  }

  const patchEdges: EditorEdgesApi['patch'] = (
    edgeIds,
    patch
  ) => {
    if (!hasEdgePatchContent(patch)) {
      return undefined
    }

    const updates = edgeIds.flatMap((id) => engine.read.edge.item.get(id)
      ? [{
          id,
          patch
        }]
      : [])
    if (!updates.length) {
      return undefined
    }

    return write.document.edge.updateMany(updates)
  }
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
      selectionToolbar: readStore(read.selection.toolbar),
      edgeToolbar: readStore(read.edge.toolbar),
      history: readStore(read.history),
      draw: readStore(read.draw)
    }),
    isEqual: (left, right) => (
      left.selectionToolbar === right.selectionToolbar
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
      summary: () => readBundle.internal.selection.model,
      overlay: () => read.selection.overlay,
      toolbar: () => read.selection.toolbar,
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
        frame: selectionCommands.frame,
        order: (mode, target = currentSelection()) => (
          selectionCommands.order(target, mode)
        ),
        group: (options) => selectionCommands.group(currentSelection(), options),
        ungroup: (options) => selectionCommands.ungroup(currentSelection(), options),
        delete: (options) => selectionCommands.delete(currentSelection(), options),
        duplicate: (options) => selectionCommands.duplicate(currentSelection(), options)
      },
      edit: {
        ...write.session.edit,
        cancel: write.session.edit.clear,
        commit: write.session.edit.clear,
        nodeText: write.preview.node.text
      },
      interaction: input,
      node: {
        create: write.document.node.create,
        patch: patchNodes,
        move: write.document.node.move,
        align: write.document.node.align,
        distribute: write.document.node.distribute,
        remove: write.document.node.deleteCascade,
        duplicate: write.document.node.duplicate,
        lock: write.document.node.lock.set,
        text: {
          commit: write.document.node.text.commit,
          color: write.document.node.text.setColor,
          size: write.document.node.text.setSize,
          weight: write.document.node.text.setWeight,
          italic: write.document.node.text.setItalic,
          align: write.document.node.text.setAlign
        },
        style: {
          fill: write.document.node.appearance.setFill,
          stroke: write.document.node.appearance.setStroke
        },
        shape: {
          set: write.document.node.shape.setKind
        }
      },
      edge: {
        create: write.document.edge.create,
        patch: patchEdges,
        move: write.document.edge.move,
        reconnect: write.document.edge.reconnect,
        remove: write.document.edge.delete,
        route: write.document.edge.route,
        label: {
          add: edgeLabelActions.add,
          patch: edgeLabelActions.patch,
          remove: edgeLabelActions.remove,
          setText: (edgeId, labelId, text) => edgeLabelActions.patch(edgeId, labelId, {
            text
          })
        }
      },
      mindmap: {
        create: write.document.mindmap.create,
        remove: write.document.mindmap.delete,
        insert: write.document.mindmap.insert,
        move: write.document.mindmap.moveSubtree,
        removeNode: write.document.mindmap.removeSubtree,
        clone: write.document.mindmap.cloneSubtree,
        patchNode: write.document.mindmap.updateNode,
        insertByPlace: write.document.mindmap.insertByPlacement,
        moveByDrop: write.document.mindmap.moveByDrop,
        moveRoot: write.document.mindmap.moveRoot
      },
      clipboard: clipboardActions,
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
        bounds: read.node.bounds
      },
      edge: {
        item: () => read.edge.item,
        resolved: () => read.edge.resolved,
        view: () => read.edge.view,
        toolbar: () => read.edge.toolbar,
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
        listener(commit.document, commit)
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
