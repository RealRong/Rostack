import { isNodeUpdateEmpty } from '@whiteboard/core/node'
import type { Engine } from '@whiteboard/engine'
import type { EdgePatch, Viewport } from '@whiteboard/core/types'
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
  const selectionActions = createSelectionActions({
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
      selection: selectionActions,
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

  const patchNodes: Editor['document']['nodes']['patch'] = (
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

  const patchEdges: Editor['document']['edges']['patch'] = (
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

  const editor = {
    read,
    state,
    document: {
      replace: replaceDocument,
      history: write.document.history,
      selection: selectionActions,
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
        labels: edgeLabelActions
      },
      mindmaps: write.document.mindmap,
      clipboard: clipboardActions
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
      engine.dispose()
    }
  } satisfies Editor

  return editor
}
