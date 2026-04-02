import { useEffect, useRef } from 'react'
import {
  createYjsSession,
  type CollabSession
} from '@whiteboard/collab'
import type { WhiteboardCollabOptions } from '../../types/common/collab'

export const CollabLifecycle = ({
  collab,
  engine
}: {
  collab?: WhiteboardCollabOptions
  engine: Parameters<typeof createYjsSession>[0]['engine']
}) => {
  const collabSessionRef = useRef<CollabSession | null>(null)
  const onCollabSessionRef = useRef(collab?.onSession)
  const onCollabStatusChangeRef = useRef(collab?.onStatusChange)
  const lastCollabSessionCallbackRef = useRef(collab?.onSession)
  const lastCollabStatusCallbackRef = useRef(collab?.onStatusChange)

  onCollabSessionRef.current = collab?.onSession
  onCollabStatusChangeRef.current = collab?.onStatusChange

  useEffect(() => {
    if (!collab) {
      return
    }

    const session = createYjsSession({
      engine,
      doc: collab.doc,
      provider: collab.provider,
      bootstrap: collab.bootstrap
    })
    collabSessionRef.current = session
    onCollabSessionRef.current?.(session)
    onCollabStatusChangeRef.current?.(session.status.get())

    const unsubscribeStatus = session.status.subscribe(() => {
      onCollabStatusChangeRef.current?.(session.status.get())
    })

    if (collab.autoConnect ?? true) {
      session.connect()
    }

    return () => {
      unsubscribeStatus()
      collabSessionRef.current = null
      onCollabSessionRef.current?.(null)
      session.destroy()
    }
  }, [
    collab?.autoConnect,
    collab?.bootstrap,
    collab?.doc,
    collab?.provider,
    engine
  ])

  useEffect(() => {
    if (lastCollabSessionCallbackRef.current === collab?.onSession) {
      return
    }
    lastCollabSessionCallbackRef.current = collab?.onSession
    if (!collab?.onSession || !collabSessionRef.current) {
      return
    }
    collab.onSession(collabSessionRef.current)
  }, [collab?.onSession])

  useEffect(() => {
    if (lastCollabStatusCallbackRef.current === collab?.onStatusChange) {
      return
    }
    lastCollabStatusCallbackRef.current = collab?.onStatusChange
    if (!collab?.onStatusChange || !collabSessionRef.current) {
      return
    }
    collab.onStatusChange(collabSessionRef.current.status.get())
  }, [collab?.onStatusChange])

  return null
}
