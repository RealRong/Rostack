import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import {
  Whiteboard,
  type WhiteboardInstance
} from '@whiteboard/react'
import { getEdgePathBounds } from '@whiteboard/core/edge'
import type { Document } from '@whiteboard/core/types'
import { scenarios } from './scenarios'
import {
  createBroadcastChannelCollab,
  createDemoUser,
  readRoomIdFromUrl,
  serializeTool,
  type DemoAwareness,
  type DemoPresenceState
} from './collab'

const resolveScenario = (id: string) =>
  scenarios.find((item) => item.id === id) ?? scenarios[0]

const getSelectionSnapshot = (
  instance: WhiteboardInstance
) => ({
  nodeIds: [...instance.state.selection.get().nodeIds],
  edgeIds: [...instance.state.selection.get().edgeIds]
})

const getActivity = (
  instance: WhiteboardInstance,
  fallback: DemoPresenceState['activity'] = 'idle'
): DemoPresenceState['activity'] => (
  instance.state.edit.get()
    ? 'editing'
    : fallback
)

const toScreenRect = (
  instance: WhiteboardInstance,
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
) => {
  const topLeft = instance.read.viewport.worldToScreen({
    x: rect.x,
    y: rect.y
  })
  const bottomRight = instance.read.viewport.worldToScreen({
    x: rect.x + rect.width,
    y: rect.y + rect.height
  })

  return {
    left: Math.min(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y)
  }
}

const formatToolLabel = (
  state: DemoPresenceState['tool']
) => {
  if (!state) {
    return 'select'
  }
  switch (state.type) {
    case 'edge':
    case 'insert':
    case 'draw':
      return `${state.type}:${state.value ?? ''}`
    default:
      return state.type
  }
}

const RemotePresenceLayer = ({
  awareness,
  instance
}: {
  awareness: DemoAwareness | null
  instance: WhiteboardInstance | null
}) => {
  if (!awareness || !instance) {
    return null
  }

  const peers = Array.from(awareness.getStates().entries())
    .filter(([clientId]) => clientId !== awareness.clientId)

  return (
    <div className="demo-presence-layer">
      {peers.map(([clientId, state]) => {
        const selectionRects = [
          ...state.selection?.nodeIds.map((nodeId) => {
            const bounds = instance.read.node.outline(nodeId)
            if (!bounds) {
              return null
            }
            return (
              <div
                key={`node-${nodeId}`}
                className="demo-remote-selection"
                style={{
                  ...toScreenRect(instance, bounds),
                  borderColor: state.user.color,
                  backgroundColor: `${state.user.color}18`
                }}
              />
            )
          }) ?? [],
          ...state.selection?.edgeIds.map((edgeId) => {
            const bounds = getEdgePathBounds(
              instance.read.edge.resolved.get(edgeId)?.path ?? {
                points: [],
                segments: []
              }
            )
            if (!bounds) {
              return null
            }
            return (
              <div
                key={`edge-${edgeId}`}
                className="demo-remote-selection demo-remote-selection-edge"
                style={{
                  ...toScreenRect(instance, bounds),
                  borderColor: state.user.color,
                  backgroundColor: `${state.user.color}12`
                }}
              />
            )
          }) ?? []
        ].filter((entry): entry is ReactElement => Boolean(entry))

        const cursor = state.pointer
          ? instance.read.viewport.worldToScreen(state.pointer.world)
          : null

        return (
          <div key={clientId}>
            {selectionRects}
            {cursor ? (
              <div
                className="demo-remote-cursor"
                style={{
                  left: cursor.x,
                  top: cursor.y,
                  '--demo-user-color': state.user.color
                } as CSSProperties}
              >
                <div className="demo-remote-cursor-dot" />
                <div className="demo-remote-cursor-label">
                  <strong>{state.user.name}</strong>
                  <span>{state.activity ?? 'idle'} · {formatToolLabel(state.tool)}</span>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export const App = () => {
  const [user] = useState(() => createDemoUser())
  const roomId = readRoomIdFromUrl()
  const [doc, setDoc] = useState<Document>(() => resolveScenario(scenarios[0].id).create())
  const [instance, setInstance] = useState<WhiteboardInstance | null>(null)
  const [awarenessVersion, setAwarenessVersion] = useState(0)
  const [viewportVersion, setViewportVersion] = useState(0)
  const instanceRef = useRef<WhiteboardInstance | null>(null)
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const lastPointerPublishAtRef = useRef(0)
  const collabBinding = useMemo(
    () => createBroadcastChannelCollab({
      roomId,
      user
    }),
    [roomId, user]
  )
  const awareness = collabBinding.awareness

  const onDocumentChange = useCallback((next: Document) => {
    setDoc(next)
  }, [])

  const collab = useMemo(() => ({
    doc: collabBinding.doc,
    provider: collabBinding.provider,
    bootstrap: 'auto',
    autoConnect: true
  }), [collabBinding])

  useEffect(() => {
    return () => {
      collabBinding.destroy()
    }
  }, [collabBinding])

  useEffect(() => {
    const unsubscribe = awareness.subscribe(() => {
      setAwarenessVersion((value) => value + 1)
    })

    return () => {
      unsubscribe()
    }
  }, [awareness])

  useEffect(() => {
    if (!instance) {
      return
    }

    const unsubscribe = instance.read.viewport.subscribe(() => {
      setViewportVersion((value) => value + 1)
    })

    return () => {
      unsubscribe()
    }
  }, [instance])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    instance.commands.viewport.reset()
    instance.commands.selection.clear()
  }, [doc.id])

  const syncPresence = useCallback((input?: {
    pointer?: DemoPresenceState['pointer']
    clearPointer?: boolean
    activity?: DemoPresenceState['activity']
  }) => {
    const current = instanceRef.current
    if (!current) {
      return
    }

    awareness.updateLocalState((prev) => {
      const pointer = input?.clearPointer
        ? undefined
        : input?.pointer ?? prev?.pointer
      const activity = getActivity(
        current,
        input?.activity ?? (pointer ? 'pointing' : 'idle')
      )

      return {
        user,
        pointer,
        selection: getSelectionSnapshot(current),
        tool: serializeTool(current.state.tool.get()),
        activity,
        updatedAt: Date.now()
      }
    })
  }, [awareness, user])

  useEffect(() => {
    if (!instance) {
      return
    }

    syncPresence()

    const unsubscribeSelection = instance.state.selection.subscribe(() => {
      syncPresence()
    })
    const unsubscribeTool = instance.state.tool.subscribe(() => {
      syncPresence()
    })
    const unsubscribeEdit = instance.state.edit.subscribe(() => {
      syncPresence()
    })

    return () => {
      unsubscribeSelection()
      unsubscribeTool()
      unsubscribeEdit()
    }
  }, [instance, syncPresence])

  useEffect(() => {
    const clearPresence = () => {
      syncPresence({
        clearPointer: true,
        activity: 'idle'
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        return
      }
      clearPresence()
    }

    window.addEventListener('blur', clearPresence)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', clearPresence)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncPresence])

  const handleInstanceRef = useCallback((next: WhiteboardInstance | null) => {
    instanceRef.current = next
    setInstance(next)
  }, [])

  const publishPointer = useCallback((
    clientX: number,
    clientY: number,
    activity: DemoPresenceState['activity']
  ) => {
    const current = instanceRef.current
    if (!current) {
      return
    }
    const now = performance.now()
    if (now - lastPointerPublishAtRef.current < 16) {
      return
    }
    lastPointerPublishAtRef.current = now
    const pointer = current.read.viewport.pointer({
      clientX,
      clientY
    })
    syncPresence({
      pointer: {
        world: pointer.world,
        timestamp: Date.now()
      },
      activity
    })
  }, [syncPresence])

  const handleBoardPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      publishPointer(event.clientX, event.clientY, 'pointing')
      if (event.button !== 2) return
      const instance = instanceRef.current
      if (!instance) return
      panRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // ignore capture errors
      }
      event.preventDefault()
      publishPointer(event.clientX, event.clientY, 'dragging')
    },
    [publishPointer]
  )

  const handleBoardPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pan = panRef.current
      publishPointer(
        event.clientX,
        event.clientY,
        pan && pan.pointerId === event.pointerId ? 'dragging' : 'pointing'
      )
      if (!pan || pan.pointerId !== event.pointerId) return
      const instance = instanceRef.current
      if (!instance) return
      const deltaX = event.clientX - pan.lastX
      const deltaY = event.clientY - pan.lastY
      if (deltaX === 0 && deltaY === 0) return
      pan.lastX = event.clientX
      pan.lastY = event.clientY
      const zoom = instance.read.viewport.get().zoom
      if (!Number.isFinite(zoom) || zoom <= 0) return
      instance.commands.viewport.panBy({
        x: -deltaX / zoom,
        y: -deltaY / zoom
      })
      event.preventDefault()
    },
    [publishPointer]
  )

  const stopPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      panRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore capture errors
      }
      event.preventDefault()
    }
    publishPointer(event.clientX, event.clientY, 'pointing')
  }, [publishPointer])

  const clearPointer = useCallback(() => {
    syncPresence({
      clearPointer: true,
      activity: 'idle'
    })
  }, [syncPresence])

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])

  return (
    <div className="demo-root">
      <div
        className="demo-board"
        onPointerDownCapture={handleBoardPointerDownCapture}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        onPointerLeave={clearPointer}
        onContextMenu={handleContextMenu}
      >
        <RemotePresenceLayer
          awareness={awareness}
          instance={instance}
          key={`${viewportVersion}-${awarenessVersion}-${doc.id}`}
        />
        <Whiteboard
          ref={handleInstanceRef}
          document={doc}
          onDocumentChange={onDocumentChange}
          collab={collab}
          options={{
            className: 'rostack-ui-theme',
            style: { width: '100%', height: '100%' },
            tool: { type: 'select' },
            mindmapLayout: { mode: 'simple' }
          }}
        />
      </div>
    </div>
  )
}
