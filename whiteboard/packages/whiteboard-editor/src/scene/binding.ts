import type {
  EditorSceneSource,
  EditorSceneSourceChange,
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
  createDocumentCommitSourceChange,
  createEditorStateCommitSourceChange,
  createTransientPreviewSourceChange,
  hasSourceChange
} from './sourceChange'

export interface EditorSceneBinding extends EditorSceneSource {
  dispose(): void
}

export const createEditorSceneBinding = ({
  engine,
  session
}: {
  engine: Pick<Engine, 'doc' | 'rev' | 'commits'>
  session: Pick<EditorSession, 'state' | 'interaction' | 'preview' | 'viewport' | 'stateEngine'>
}): EditorSceneBinding => {
  const listeners = new Set<(change: EditorSceneSourceChange) => void>()
  let disposed = false
  const buildSnapshot = (): EditorSceneSourceSnapshot => buildEditorSceneSourceSnapshot({
    engine,
    session
  })
  let currentSource = buildSnapshot()

  const notify = (change: EditorSceneSourceChange) => {
    if (disposed) {
      return
    }

    listeners.forEach((listener) => {
      listener(change)
    })
  }

  const publish = (
    compile: (input: {
      previous: EditorSceneSourceSnapshot
      next: EditorSceneSourceSnapshot
    }) => EditorSceneSourceChange
  ) => {
    const previous = currentSource
    const next = buildSnapshot()
    currentSource = next

    const change = compile({
      previous,
      next
    })
    if (!hasSourceChange(change)) {
      return
    }

    notify(change)
  }

  const unsubscribes = [
    engine.commits.subscribe((commit) => {
      publish(({ previous, next }) => createDocumentCommitSourceChange({
        commit,
        previous,
        next
      }))
    }),
    session.stateEngine.commits.subscribe((commit) => {
      publish(({ previous, next }) => createEditorStateCommitSourceChange({
        commit,
        previous,
        next
      }))
    }),
    session.preview.state.subscribe(() => {
      publish(({ previous, next }) => createTransientPreviewSourceChange({
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
