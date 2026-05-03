import {
  useEffect,
  useEffectEvent,
  useRef
} from 'react'
import type {
  CollabStatus,
  MutationCollabEngine
} from '@shared/collab'
import {
  createYjsMutationCollabSession
} from '@shared/collab-yjs'
import {
  document as documentApi
} from '@whiteboard/core/document'
import {
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'
import type {
  WhiteboardCollabOptions,
  WhiteboardCollabSession
} from '@whiteboard/react/types/common/collab'
import type { WhiteboardRuntimeServices } from '@whiteboard/react/runtime/whiteboard/services'
import type { IntentResult } from '@whiteboard/engine'
import type { MutationCommit, MutationDocument } from '@shared/mutation'

export const useWhiteboardCollab = (input: {
  collab?: WhiteboardCollabOptions
  services: WhiteboardRuntimeServices
}) => {
  const collabSessionRef = useRef<WhiteboardCollabSession | null>(null)

  const notifyCollabSession = useEffectEvent((session: WhiteboardCollabSession | null) => {
    input.collab?.onSession?.(session)
  })
  const notifyCollabStatus = useEffectEvent((status: CollabStatus) => {
    input.collab?.onStatusChange?.(status)
  })

  useEffect(() => {
    const collab = input.collab
    if (!collab) {
      return
    }

    const collabEngine = {
      commits: {
        subscribe: (listener) => (
          input.services.engine.commits.subscribe((commit) => {
            listener({
              ...commit,
              writes: commit.authored
            } as unknown as MutationCommit<typeof whiteboardMutationSchema>)
          })
        )
      },
      doc: () => input.services.engine.doc() as unknown as MutationDocument<typeof whiteboardMutationSchema>,
      replace: (document: MutationDocument<typeof whiteboardMutationSchema>, options?: {
        origin?: 'user' | 'remote' | 'system'
        history?: boolean
      }) => input.services.engine.replace(document as unknown as ReturnType<typeof input.services.engine.doc>, options),
      apply: (writes: Parameters<typeof input.services.engine.apply>[0], options?: {
        origin?: 'user' | 'remote' | 'system'
        history?: boolean
      }) => input.services.engine.apply(writes, options)
    } as MutationCollabEngine<
      typeof whiteboardMutationSchema,
      IntentResult
    >

    const session = createYjsMutationCollabSession({
      schema: whiteboardMutationSchema,
      engine: collabEngine,
      doc: collab.doc,
      actorId: collab.actorId,
      provider: collab.provider,
      document: {
        empty: () => documentApi.create(input.services.engine.doc().id),
        decode: (value) => documentApi.normalize(value as ReturnType<typeof input.services.engine.doc>)
      }
    })
    input.services.setHistorySource({
      state: () => {
        const state = session.localHistory.get()
        return {
          undoDepth: state.undoDepth,
          redoDepth: state.redoDepth
        }
      },
      canUndo: () => {
        const state = session.localHistory.get()
        return !state.isApplying && state.undoDepth > 0
      },
      canRedo: () => {
        const state = session.localHistory.get()
        return !state.isApplying && state.redoDepth > 0
      },
      undo: () => session.localHistory.undo(),
      redo: () => session.localHistory.redo(),
      clear: () => {
        session.localHistory.clear()
      }
    })
    collabSessionRef.current = session
    notifyCollabSession(session)
    notifyCollabStatus(session.status.get())

    const unsubscribeStatus = session.status.subscribe(() => {
      notifyCollabStatus(session.status.get())
    })

    if (collab.autoConnect ?? true) {
      session.connect()
    }

    return () => {
      unsubscribeStatus()
      input.services.resetHistorySource()
      collabSessionRef.current = null
      notifyCollabSession(null)
      session.destroy()
    }
  }, [
    input.collab?.autoConnect,
    input.collab?.actorId,
    input.collab?.doc,
    input.collab?.provider,
    input.services,
    notifyCollabSession,
    notifyCollabStatus
  ])

  useEffect(() => {
    const session = collabSessionRef.current
    if (!session || !input.collab?.onSession) {
      return
    }
    input.collab.onSession(session)
  }, [input.collab?.onSession])

  useEffect(() => {
    const session = collabSessionRef.current
    if (!session || !input.collab?.onStatusChange) {
      return
    }
    input.collab.onStatusChange(session.status.get())
  }, [input.collab?.onStatusChange])
}
