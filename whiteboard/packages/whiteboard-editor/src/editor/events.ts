import { sameOrder } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorEvents } from '@whiteboard/editor/types/editor'

export type EditorEventRuntime = {
  events: EditorEvents
  dispose: () => void
}

const reconcileSessionAfterCommit = (
  session: Pick<EditorSession, 'state' | 'mutate'>,
  query: Pick<EditorQuery, 'node' | 'edge'>
) => {
  const selection = session.state.selection.get()
  const nextNodeIds = selection.nodeIds.filter((id) => Boolean(query.node.item.get(id)))
  const nextEdgeIds = selection.edgeIds.filter((id) => Boolean(query.edge.item.get(id)))

  if (
    !sameOrder(nextNodeIds, selection.nodeIds)
    || !sameOrder(nextEdgeIds, selection.edgeIds)
  ) {
    session.mutate.selection.replace({
      nodeIds: nextNodeIds,
      edgeIds: nextEdgeIds
    })
  }

  const currentEdit = session.state.edit.get()
  if (!currentEdit) {
    return
  }

  if (
    (currentEdit.kind === 'node' && !query.node.item.get(currentEdit.nodeId))
    || (currentEdit.kind === 'edge-label' && !query.edge.item.get(currentEdit.edgeId))
  ) {
    session.mutate.edit.clear()
  }
}

export const createEditorEvents = ({
  engine,
  session,
  query,
  resetHost
}: {
  engine: Engine
  session: EditorSession
  query: Pick<EditorQuery, 'node' | 'edge'>
  resetHost: () => void
}): EditorEventRuntime => {
  const disposeListeners = new Set<() => void>()
  const unsubscribeCommit = engine.commit.subscribe(() => {
    const commit = engine.commit.get()
    if (!commit) {
      return
    }

    if (commit.changes.document && commit.ops.length === 0) {
      session.reset()
      resetHost()
      return
    }

    reconcileSessionAfterCommit(session, query)
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
      Array.from(disposeListeners).forEach((listener) => listener())
      disposeListeners.clear()
    }
  }
}
