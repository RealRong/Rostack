import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Whiteboard,
  type WhiteboardInstance
} from '@whiteboard/react'
import type { Document } from '@whiteboard/core/types'
import {
  buildScenarioRoomId,
  defaultScenarioPreset,
  resolveScenarioPreset
} from '@whiteboard/demo/scenarios'
import {
  createBroadcastChannelCollab,
  createDemoUser,
  readRoomIdFromUrl
} from '@whiteboard/demo/collab'

const readScenarioPresetFromUrl = () => {
  if (typeof window === 'undefined') {
    return defaultScenarioPreset
  }

  const params = new URLSearchParams(window.location.search)
  return resolveScenarioPreset({
    scenarioId: params.get('scenario'),
    size: params.get('size')
  })
}

const readExplicitRoomIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const room = params.get('room')
  return room && room.trim().length > 0
    ? room
    : null
}

export const App = () => {
  const [preset] = useState(() => readScenarioPresetFromUrl())
  const [user] = useState(() => createDemoUser())
  const explicitRoomId = readExplicitRoomIdFromUrl()
  const roomId = readRoomIdFromUrl(buildScenarioRoomId(preset))
  const [doc, setDoc] = useState<Document>(() => preset.create())
  const instanceRef = useRef<WhiteboardInstance | null>(null)
  const collabBinding = useMemo(
    () => explicitRoomId
      ? createBroadcastChannelCollab({
          roomId,
          user
        })
      : null,
    [explicitRoomId, roomId, user]
  )

  const onDocumentChange = useCallback((next: Document) => {
    setDoc(next)
  }, [])

  const collab = useMemo(() => collabBinding
    ? {
        doc: collabBinding.doc,
        actorId: user.id,
        provider: collabBinding.provider,
        autoConnect: true,
        presence: {
          binding: collabBinding.awareness
        }
      }
    : undefined, [collabBinding, user.id])

  const options = useMemo(() => ({
    style: { width: '100%', height: '100%' },
    initialTool: { type: 'select' as const },
    mindmapLayout: { mode: 'simple' as const }
  }), [])

  useEffect(() => {
    return () => {
      collabBinding?.destroy()
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
