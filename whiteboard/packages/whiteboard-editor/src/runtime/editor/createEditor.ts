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
import { createEditorActions } from './actions'
import { createEditorInput } from './input'
import { createEditorState } from './state'
import { createEditorWrite } from '../write'
import { compileNodePatch } from '../compile/nodePatch'
import { compileEdgePatch } from '../compile/edgePatch'

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
  const write = createEditorWrite({
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
  const actions = createEditorActions({
    engine: internalEngine,
    read,
    write,
    viewport: viewport.read,
    selection: state.selection,
    edit: state.edit
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

    return write.document.node.document.updateMany(updates, {
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

  const editor = {
    read,
    state,
    document: {
      replace: write.document.doc.replace,
      history: write.document.history,
      selection: {
        duplicate: actions.document.canvas.duplicate,
        delete: actions.document.canvas.delete,
        order: actions.document.canvas.order,
        group: actions.document.groups.merge,
        ungroup: actions.document.groups.ungroup,
        frame: actions.document.nodes.frames.createFromBounds
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
          add: actions.document.edges.labels.add,
          patch: actions.document.edges.labels.update,
          remove: actions.document.edges.labels.remove
        }
      },
      mindmaps: actions.document.mindmaps,
      clipboard: {
        copy: actions.document.clipboard.export,
        cut: actions.document.clipboard.cut,
        paste: actions.document.clipboard.insert
      }
    },
    session: actions.session,
    view: actions.view,
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
