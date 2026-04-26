import { equal } from '@shared/core'
import { META } from '@whiteboard/core/spec/operation'
import type { Engine } from '@whiteboard/engine'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorEvents } from '@whiteboard/editor/types/editor'

export type EditorEventRuntime = {
  events: EditorEvents
  dispose: () => void
}

const reconcileSessionAfterWrite = (
  session: Pick<EditorSession, 'state' | 'mutate'>,
  document: {
    node: {
      get(id: string): unknown
    }
    edge: {
      get(id: string): unknown
    }
  }
) => {
  const selection = session.state.selection.get()
  const nextNodeIds = selection.nodeIds.filter((id) => Boolean(document.node.get(id)))
  const nextEdgeIds = selection.edgeIds.filter((id) => Boolean(document.edge.get(id)))

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
    (currentEdit.kind === 'node' && !document.node.get(currentEdit.nodeId))
    || (currentEdit.kind === 'edge-label' && !document.edge.get(currentEdit.edgeId))
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
  document: {
    node: {
      get(id: string): unknown
    }
    edge: {
      get(id: string): unknown
    }
  }
  resetHost: () => void
}): EditorEventRuntime => {
  const disposeListeners = new Set<() => void>()
  const unsubscribeCommit = engine.commits.subscribe((commit) => {
    if (
      commit.kind === 'replace'
      || commit.forward.some((op) => META[op.type].sync === 'checkpoint')
    ) {
      session.reset()
      resetHost()
      return
    }

    reconcileSessionAfterWrite(session, document)
  })

  return {
    events: {
      change: (listener) => engine.commits.subscribe((commit) => {
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
