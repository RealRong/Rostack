import { sameOrder } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { EditorLocal } from '@whiteboard/editor/local/runtime'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorEvents } from '@whiteboard/editor/types/editor'
import type { EditorInputRuntime } from '@whiteboard/editor/input/runtime'

export type EditorLifecycle = {
  events: EditorEvents
  dispose: () => void
}

const reconcileLocalAfterCommit = (
  local: EditorLocal,
  query: Pick<EditorQuery, 'node' | 'edge'>
) => {
  const selection = local.source.selection.get()
  const nextNodeIds = selection.nodeIds.filter((id) => Boolean(query.node.item.get(id)))
  const nextEdgeIds = selection.edgeIds.filter((id) => Boolean(query.edge.item.get(id)))

  if (
    !sameOrder(nextNodeIds, selection.nodeIds)
    || !sameOrder(nextEdgeIds, selection.edgeIds)
  ) {
    local.mutate.selection.replace({
      nodeIds: nextNodeIds,
      edgeIds: nextEdgeIds
    })
  }

  const currentEdit = local.source.edit.get()
  if (!currentEdit) {
    return
  }

  if (
    (currentEdit.kind === 'node' && !query.node.item.get(currentEdit.nodeId))
    || (currentEdit.kind === 'edge-label' && !query.edge.item.get(currentEdit.edgeId))
  ) {
    local.mutate.edit.clear()
  }
}

export const createEditorLifecycle = ({
  engine,
  local,
  input,
  query
}: {
  engine: Engine
  local: EditorLocal
  input: Pick<EditorInputRuntime, 'reset'>
  query: Pick<EditorQuery, 'node' | 'edge'>
}): EditorLifecycle => {
  const disposeListeners = new Set<() => void>()
  const unsubscribeCommit = engine.commit.subscribe(() => {
    const commit = engine.commit.get()
    if (!commit) {
      return
    }

    if (commit.kind === 'replace') {
      local.reset()
      input.reset()
      return
    }

    reconcileLocalAfterCommit(local, query)
  })

  return {
    events: {
      change: (listener) => engine.commit.subscribe(() => {
        const commit = engine.commit.get()
        if (!commit) {
          return
        }

        listener(commit.doc, commit)
      }),
      dispose: (listener) => {
        disposeListeners.add(listener)
        return () => {
          disposeListeners.delete(listener)
        }
      }
    },
    dispose: () => {
      unsubscribeCommit()
      local.reset()
      input.reset()
      Array.from(disposeListeners).forEach((listener) => listener())
      disposeListeners.clear()
      engine.dispose()
    }
  }
}
