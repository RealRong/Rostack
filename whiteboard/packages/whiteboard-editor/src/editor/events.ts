import { equal } from '@shared/core'
import { META } from '@whiteboard/core/spec/operation'
import type { Engine } from '@whiteboard/engine'
import type { EditorDocumentRuntimeSource } from '@whiteboard/editor/document/source'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorEvents } from '@whiteboard/editor/types/editor'

export type EditorEventRuntime = {
  events: EditorEvents
  dispose: () => void
}

const reconcileSessionAfterWrite = (
  session: Pick<EditorSession, 'state' | 'mutate'>,
  document: Pick<EditorDocumentRuntimeSource, 'nodes' | 'edges'>
) => {
  const selection = session.state.selection.get()
  const nextNodeIds = selection.nodeIds.filter((id) => Boolean(document.nodes.get(id)))
  const nextEdgeIds = selection.edgeIds.filter((id) => Boolean(document.edges.get(id)))

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
    (currentEdit.kind === 'node' && !document.nodes.get(currentEdit.nodeId))
    || (currentEdit.kind === 'edge-label' && !document.edges.get(currentEdit.edgeId))
  ) {
    session.mutate.edit.clear()
  }
}

export const createEditorEvents = ({
  engine,
  session,
  document,
  resetHost
}: {
  engine: Engine
  session: EditorSession
  document: Pick<EditorDocumentRuntimeSource, 'nodes' | 'edges'>
  resetHost: () => void
}): EditorEventRuntime => {
  const disposeListeners = new Set<() => void>()
  const unsubscribeWrite = engine.writes.subscribe((write) => {
    if (write.forward.some((op) => META[op.type].sync === 'checkpoint')) {
      session.reset()
      resetHost()
      return
    }

    reconcileSessionAfterWrite(session, document)
  })

  return {
    events: {
      change: (listener) => engine.writes.subscribe((write) => {
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
