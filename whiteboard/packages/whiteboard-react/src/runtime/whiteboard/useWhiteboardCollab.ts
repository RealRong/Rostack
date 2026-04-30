import {
  useEffect,
  useEffectEvent,
  useRef
} from 'react'
import { collab as collabApi, type CollabSession } from '@whiteboard/collab'
import type { WhiteboardCollabOptions } from '@whiteboard/react/types/common/collab'
import type { WhiteboardRuntimeServices } from '@whiteboard/react/runtime/whiteboard/services'

type CollabStatus = ReturnType<CollabSession['status']['get']>

export const useWhiteboardCollab = (input: {
  collab?: WhiteboardCollabOptions
  services: WhiteboardRuntimeServices
}) => {
  const collabSessionRef = useRef<CollabSession | null>(null)

  const notifyCollabSession = useEffectEvent((session: CollabSession | null) => {
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

    const session = collabApi.yjs.session.create({
      engine: input.services.engine,
      doc: collab.doc,
      actorId: collab.actorId,
      provider: collab.provider
    })
    input.services.setHistorySource(session.localHistory)
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
