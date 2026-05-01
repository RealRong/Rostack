import type {
  EditorSceneSource,
  EditorSceneSourceEvent,
  EditorSceneSourceSnapshot
} from '@whiteboard/editor-scene'
import type {
  Engine
} from '@whiteboard/engine'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import {
  buildEditorSceneSourceSnapshot
} from './sourceSnapshot'
import {
  createDocumentCommitSourceEvent,
  createEditorStateCommitSourceEvent,
  createTransientPreviewSourceEvent,
  hasSourceEvent
} from './sourceEvent'

export interface EditorSceneBinding extends EditorSceneSource {
  dispose(): void
}

export const createEditorSceneBinding = ({
  engine,
  session
}: {
  engine: Pick<Engine, 'doc' | 'rev' | 'commits'>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport' | 'commits'>
}): EditorSceneBinding => {
  const listeners = new Set<(event: EditorSceneSourceEvent) => void>()
  let disposed = false
  const buildSnapshot = (): EditorSceneSourceSnapshot => buildEditorSceneSourceSnapshot({
    engine,
    session
  })
  let currentSource = buildSnapshot()

  const notify = (event: EditorSceneSourceEvent) => {
    if (disposed) {
      return
    }

    listeners.forEach((listener) => {
      listener(event)
    })
  }

  const publish = (
    compile: (input: {
      previous: EditorSceneSourceSnapshot
      next: EditorSceneSourceSnapshot
    }) => Omit<EditorSceneSourceEvent, 'source'>
  ) => {
    const previous = currentSource
    const next = buildSnapshot()
    currentSource = next

    const event = {
      ...compile({
        previous,
        next
      }),
      source: next
    } satisfies EditorSceneSourceEvent
    if (!hasSourceEvent(event)) {
      return
    }

    notify(event)
  }

  const unsubscribes = [
    engine.commits.subscribe((commit) => {
      publish(({ previous, next }) => createDocumentCommitSourceEvent({
        commit,
        previous,
        next
      }))
    }),
    session.commits.subscribe((commit) => {
      publish(({ previous, next }) => createEditorStateCommitSourceEvent({
        commit,
        previous,
        next
      }))
    }),
    session.preview.subscribe(() => {
      publish(({ previous, next }) => createTransientPreviewSourceEvent({
        previous,
        next
      }))
    })
  ]

  return {
    get: () => currentSource,
    subscribe: (listener) => {
      if (disposed) {
        return () => {}
      }

      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      listeners.clear()
      unsubscribes.forEach((unsubscribe) => {
        unsubscribe()
      })
    }
  }
}
