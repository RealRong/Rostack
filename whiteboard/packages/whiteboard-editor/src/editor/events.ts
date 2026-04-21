import { equal } from '@shared/core'
import { sync } from '@whiteboard/core/spec/operation'
import type { Engine } from '@whiteboard/engine'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorEvents } from '@whiteboard/editor/types/editor'

export type EditorEventRuntime = {
  events: EditorEvents
  dispose: () => void
}

const reconcileSessionAfterWrite = (
  session: Pick<EditorSession, 'state' | 'mutate'>,
  query: Pick<EditorQuery, 'node' | 'edge'>
) => {
  const selection = session.state.selection.get()
  const nextNodeIds = selection.nodeIds.filter((id) => Boolean(query.node.item.get(id)))
  const nextEdgeIds = selection.edgeIds.filter((id) => Boolean(query.edge.item.get(id)))

  if (
    !equal.sameOrder(nextNodeIds, selection.nodeIds)
    || !equal.sameOrder(nextEdgeIds, selection.edgeIds)
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
  const unsubscribeWrite = engine.write.subscribe(() => {
    const write = engine.write.get()
    if (!write) {
      return
    }

    if (write.forward.some((op) => sync.isCheckpointOnly(op))) {
      session.reset()
      resetHost()
      return
    }

    reconcileSessionAfterWrite(session, query)
  })

  return {
    events: {
      change: (listener) => engine.write.subscribe(() => {
        const write = engine.write.get()
        if (!write) {
          return
        }

        listener(write.doc, write)
      }),
      dispose: (listener) => {
        disposeListeners.add(listener)
        return () => {
          disposeListeners.delete(listener)
        }
      }
    },
    dispose: () => {
      unsubscribeWrite()
      Array.from(disposeListeners).forEach((listener) => listener())
      disposeListeners.clear()
    }
  }
}
