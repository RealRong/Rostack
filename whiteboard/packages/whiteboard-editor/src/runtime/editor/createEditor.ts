import type { Engine } from '@whiteboard/engine'
import type { EngineInstance } from '@engine-types/instance'
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
import { createEditorInput } from './input'
import { createEditorState } from './state'
import { compileNodePatch } from '../compile/nodePatch'
import { compileEdgePatch } from '../compile/edgePatch'
import { createEditorRuntime } from './host'
import { createCanvasActions } from '../actions/canvas'
import { createGroupsActions } from '../actions/group'
import { createFramesActions } from '../actions/frame'
import { createEdgesActions } from '../actions/edge'
import { createClipboardActions } from '../actions/clipboard'

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
  const internalEngine = engine as EngineInstance
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
    engineRead: internalEngine.read,
    registry,
    history: internalEngine.history,
    runtime,
    interaction,
    overlay,
    viewport
  })
  const read = readBundle.read
  const write = createEditorRuntime({
    engine: internalEngine,
    read,
    runtime,
    overlay,
    viewport
  })
  const snap = createSnapRuntime({
    readZoom: () => viewport.read.get().zoom,
    node: {
      config: internalEngine.config.node,
      query: internalEngine.read.index.snap.inRect
    },
    edge: {
      config: internalEngine.config.edge,
      nodeSize: internalEngine.config.nodeSize,
      query: read.edge.connectCandidates
    }
  })
  const state = createEditorState({
    interaction,
    runtime,
    viewport: viewport.read
  })
  const selectionActions = createCanvasActions({
    read,
    commands: {
      document: {
        delete: write.document.delete,
        duplicate: write.document.duplicate,
        order: write.document.order
      },
      group: write.document.group.order,
      selection: write.session.selection
    }
  })
  const groupActions = createGroupsActions({
    read,
    commands: {
      group: write.document.group,
      selection: write.session.selection
    }
  })
  const frameActions = createFramesActions({
    commands: {
      node: {
        create: write.document.node.create
      },
      selection: write.session.selection
    }
  })
  const edgeActions = createEdgesActions({
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
      canvas: selectionActions,
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
    config: internalEngine.config,
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

  const unsubscribeCommit = internalEngine.commit.subscribe(() => {
    const commit = internalEngine.commit.get()
    if (!commit) {
      return
    }

    if (commit.kind === 'replace') {
      resetRuntimeState()
      return
    }

    runtime.reconcileAfterCommit(read)
  })

  const patchNodes: Editor['document']['nodes']['patch'] = (
    ids,
    patch,
    options
  ) => {
    const updates = compileNodePatch({
      ids,
      patch,
      measuredSizeById: options?.measuredSizeById,
      readNode: internalEngine.read.node.item.get
    })
    if (!updates.length) {
      return undefined
    }

    return write.document.node.updateMany(updates, {
      origin: options?.origin
    })
  }

  const patchEdges: Editor['document']['edges']['patch'] = (
    edgeIds,
    patch
  ) => {
    const updates = compileEdgePatch({
      edgeIds,
      patch,
      readEdge: (id) => internalEngine.read.edge.item.get(id)?.edge
    })
    if (!updates.length) {
      return undefined
    }

    return write.document.edge.updateMany(updates)
  }
  const {
    replace: replaceDocument
  } = write.document

  const editor = {
    read,
    state,
    document: {
      replace: replaceDocument,
      history: write.document.history,
      selection: {
        duplicate: selectionActions.duplicate,
        delete: selectionActions.delete,
        order: selectionActions.order,
        group: groupActions.merge,
        ungroup: groupActions.ungroup,
        frame: frameActions.createFromBounds
      },
      nodes: {
        create: write.document.node.create,
        patch: patchNodes,
        move: write.document.node.move,
        align: write.document.node.align,
        distribute: write.document.node.distribute,
        remove: write.document.node.deleteCascade,
        duplicate: write.document.node.duplicate
      },
      edges: {
        create: write.document.edge.create,
        patch: patchEdges,
        move: write.document.edge.move,
        reconnect: write.document.edge.reconnect,
        remove: write.document.edge.delete,
        route: write.document.edge.route,
        labels: {
          add: edgeActions.labels.add,
          patch: edgeActions.labels.update,
          remove: edgeActions.labels.remove
        }
      },
      mindmaps: write.document.mindmap,
      clipboard: {
        copy: clipboardActions.export,
        cut: clipboardActions.cut,
        paste: clipboardActions.insert
      }
    },
    session: write.session,
    view: {
      viewport: {
        set: write.view.viewport.set,
        panBy: write.view.viewport.panBy,
        zoomTo: write.view.viewport.zoomTo,
        fit: write.view.viewport.fit,
        reset: write.view.viewport.reset,
        setRect: write.view.viewport.setRect,
        setLimits: write.view.viewport.setLimits
      },
      pointer: write.view.pointer,
      space: write.view.space,
      draw: write.view.draw,
      preview: {
        nodeText: write.preview.node.text
      }
    },
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
      internalEngine.dispose()
    }
  } satisfies Editor

  return editor
}
