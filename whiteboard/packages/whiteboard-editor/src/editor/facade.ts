import {
  createDerivedStore,
  read as readValue
} from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { EditorInput, Editor } from '@whiteboard/editor/types/editor'
import type { EditorCommandRuntime } from '@whiteboard/editor/command'
import type { EditorLocalRuntime } from '@whiteboard/editor/local/runtime'
import type { QueryRuntime } from '@whiteboard/editor/query'
import { createEditorState } from '@whiteboard/editor/editor/state'

const resolveNodeCommitValue = (input: {
  text: string
  empty: 'default' | 'keep' | 'remove'
  defaultText?: string
}) => (
  input.empty === 'default' && !input.text.trim()
    ? (input.defaultText ?? '')
    : input.text
)

const createEditActions = ({
  local,
  query,
  command
}: {
  local: Pick<EditorLocalRuntime, 'state' | 'stores' | 'actions'>
  query: QueryRuntime
  command: EditorCommandRuntime
}) => ({
  ...local.actions.edit,
  cancel: () => {
    const currentEdit = local.stores.edit.get()
    if (!currentEdit) {
      return undefined
    }

    if (
      currentEdit.kind === 'edge-label'
      && currentEdit.capabilities.empty === 'remove'
      && !currentEdit.initial.text.trim()
    ) {
      const committedEdge = query.read.edge.committed.get(currentEdit.edgeId)?.edge
      if (!committedEdge?.labels?.some((label) => label.id === currentEdit.labelId)) {
        local.actions.edit.clear()
        return undefined
      }

      local.actions.edit.clear()
      return command.edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
    }

    local.actions.edit.clear()
    return undefined
  },
  commit: () => {
    const currentEdit = local.stores.edit.get()
    if (!currentEdit) {
      return undefined
    }

    local.state.edit.mutate.status('committing')

    if (currentEdit.kind === 'node') {
      const committed = query.read.node.committed.get(currentEdit.nodeId)
      if (!committed) {
        local.actions.edit.clear()
        return undefined
      }

      return command.node.text.commit({
        nodeId: currentEdit.nodeId,
        field: currentEdit.field,
        value: resolveNodeCommitValue({
          text: currentEdit.draft.text,
          empty: currentEdit.capabilities.empty,
          defaultText: currentEdit.capabilities.defaultText
        })
      })
    }

    if (
      currentEdit.capabilities.empty === 'remove'
      && !currentEdit.draft.text.trim()
    ) {
      local.actions.edit.clear()
      return command.edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
    }

    local.actions.edit.clear()
    return command.edge.label.patch(
      currentEdit.edgeId,
      currentEdit.labelId,
      {
        text: currentEdit.draft.text
      }
    )
  }
})

export const createEditorFacade = ({
  engine,
  local,
  query,
  command,
  input
}: {
  engine: Engine
  local: EditorLocalRuntime
  query: QueryRuntime
  command: EditorCommandRuntime
  input: EditorInput
}): Editor => {
  const state = createEditorState({
    interaction: local.interaction,
    runtime: local,
    viewport: local.viewport.read
  })
  const resetRuntimeState = () => {
    input.cancel()
    local.reset()
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

    local.reconcileAfterCommit(query.read)
  })

  const chrome = createDerivedStore({
    get: () => ({
      marquee: readValue(query.read.feedback.marquee),
      draw: readValue(query.read.feedback.draw),
      edgeGuide: readValue(query.read.feedback.edgeGuide),
      snap: readValue(query.read.feedback.snap),
      selection: readValue(query.read.selection.overlay)
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
      selectionToolbar: readValue(query.read.selection.toolbar),
      history: readValue(query.read.history),
      draw: readValue(query.read.draw)
    }),
    isEqual: (left, right) => (
      left.selectionToolbar === right.selectionToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })
  const editActions = createEditActions({
    local,
    query,
    command
  })
  const disposeListeners = new Set<() => void>()
  const dispose = () => {
    unsubscribeCommit()
    resetRuntimeState()
    Array.from(disposeListeners).forEach(listener => listener())
    disposeListeners.clear()
    engine.dispose()
  }

  return {
    store: state,
    read: {
      ...query.read,
      chrome,
      panel,
      selectionModel: query.selectionModel
    },
    actions: {
      app: {
        reset: resetRuntimeState,
        replace: command.document.replace,
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
        set: local.actions.session.tool.set,
        select: () => {
          local.actions.session.tool.set({ type: 'select' })
        },
        draw: (mode) => {
          local.actions.session.tool.set({ type: 'draw', mode })
        },
        edge: (preset) => {
          local.actions.session.tool.set({ type: 'edge', preset })
        },
        insert: (preset) => {
          local.actions.session.tool.set({ type: 'insert', preset })
        },
        hand: () => {
          local.actions.session.tool.set({ type: 'hand' })
        }
      },
      viewport: {
        set: local.actions.viewport.viewport.set,
        panBy: local.actions.viewport.viewport.panBy,
        zoomTo: local.actions.viewport.viewport.zoomTo,
        fit: local.actions.viewport.viewport.fit,
        reset: local.actions.viewport.viewport.reset,
        setRect: local.actions.viewport.viewport.setRect,
        setLimits: local.actions.viewport.viewport.setLimits
      },
      draw: local.actions.draw,
      selection: {
        replace: local.actions.session.selection.replace,
        add: local.actions.session.selection.add,
        remove: local.actions.session.selection.remove,
        toggle: local.actions.session.selection.toggle,
        selectAll: local.actions.session.selection.selectAll,
        clear: local.actions.session.selection.clear,
        frame: command.selection.frame,
        order: command.selection.order,
        group: command.selection.group,
        ungroup: command.selection.ungroup,
        delete: command.selection.delete,
        duplicate: command.selection.duplicate
      },
      edit: editActions,
      interaction: input,
      node: command.node,
      edge: {
        create: command.edge.create,
        patch: command.edge.patch,
        move: command.edge.move,
        reconnect: command.edge.reconnect,
        delete: command.edge.delete,
        route: command.edge.route,
        label: command.edge.label,
        style: command.edge.style,
        type: command.edge.type,
        textMode: command.edge.textMode
      },
      mindmap: command.mindmap,
      clipboard: command.clipboard,
      history: command.history
    },
    events: {
      change: (listener) => engine.commit.subscribe(() => {
        const commit = engine.commit.get()
        if (!commit) {
          return
        }
        listener(commit.doc, commit)
      }),
      history: (listener) => query.read.history.subscribe(() => {
        listener(query.read.history.get())
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
}
