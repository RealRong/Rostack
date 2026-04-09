import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Whiteboard,
  type WhiteboardInstance
} from '@whiteboard/react'
import type { Document } from '@whiteboard/core/types'
import { scenarios } from './scenarios'
import {
  createBroadcastChannelCollab,
  createDemoUser,
  readRoomIdFromUrl
} from './collab'

const resolveScenario = (id: string) =>
  scenarios.find((item) => item.id === id) ?? scenarios[0]

export const App = () => {
  const [user] = useState(() => createDemoUser())
  const roomId = readRoomIdFromUrl()
  const [doc, setDoc] = useState<Document>(() => resolveScenario(scenarios[0].id).create())
  const instanceRef = useRef<WhiteboardInstance | null>(null)
  const collabBinding = useMemo(
    () => createBroadcastChannelCollab({
      roomId,
      user
    }),
    [roomId, user]
  )

  const onDocumentChange = useCallback((next: Document) => {
    setDoc(next)
  }, [])

  const collab = useMemo(() => ({
    doc: collabBinding.doc,
    provider: collabBinding.provider,
    bootstrap: 'auto' as const,
    autoConnect: true,
    presence: {
      binding: collabBinding.awareness
    }
  }), [collabBinding])

  const options = useMemo(() => ({
    style: { width: '100%', height: '100%' },
    initialTool: { type: 'select' as const },
    mindmapLayout: { mode: 'simple' as const }
  }), [])

  useEffect(() => {
    return () => {
      collabBinding.destroy()
    }
  }, [collabBinding])

  const handleInstanceRef = useCallback((next: WhiteboardInstance | null) => {
    instanceRef.current = next
  }, [])

  return (
    <div className="demo-root">
      <div className="demo-board">
        <Whiteboard
          ref={handleInstanceRef}
          document={doc}
          onDocumentChange={onDocumentChange}
          collab={collab}
          options={options}
        />
      </div>
    </div>
  )
}
