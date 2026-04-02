import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import {
  Whiteboard,
  type WhiteboardCollabOptions,
  type WhiteboardInstance
} from '@whiteboard/react'
import type { Document, NodeInput, Size } from '@whiteboard/core/types'
import { createId } from '@whiteboard/core/utils'
import { scenarios } from './scenarios'
import {
  buildRoomUrl,
  createBroadcastChannelCollab,
  createDemoUser,
  normalizeRoomId,
  readRoomIdFromUrl,
  serializeTool,
  type DemoAwareness,
  type DemoPresenceState,
  type DemoUser
} from './collab'

const resolveScenario = (id: string) =>
  scenarios.find((item) => item.id === id) ?? scenarios[0]

const resolveScenarioByDocumentId = (documentId: string) =>
  scenarios.find((item) => item.documentId === documentId)

const INSERTABLE_NODES: Array<{
  type: NodeInput['type']
  label: string
  size: Size
  data?: Record<string, unknown>
}> = [
  {
    type: 'shape',
    label: '椭圆',
    size: { width: 200, height: 130 },
    data: { kind: 'ellipse', text: 'Ellipse' }
  },
  {
    type: 'shape',
    label: '菱形',
    size: { width: 180, height: 180 },
    data: { kind: 'diamond', text: 'Decision' }
  },
  {
    type: 'shape',
    label: '三角形',
    size: { width: 190, height: 160 },
    data: { kind: 'triangle', text: 'Triangle' }
  },
  {
    type: 'shape',
    label: '箭头',
    size: { width: 220, height: 120 },
    data: { kind: 'arrow-sticker', text: 'Arrow' }
  },
  {
    type: 'shape',
    label: '气泡',
    size: { width: 280, height: 160 },
    data: { kind: 'callout', text: 'Callout' }
  },
  {
    type: 'shape',
    label: '高亮',
    size: { width: 240, height: 110 },
    data: { kind: 'highlight', text: 'Highlight' }
  }
]

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
  const topLeft = instance.viewport.worldToScreen({
    x: rect.x,
    y: rect.y
  })
  const bottomRight = instance.viewport.worldToScreen({
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
            const bounds = instance.read.node.bounds(nodeId)
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
            const bounds = instance.read.edge.bounds(edgeId)
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
          ? instance.viewport.worldToScreen(state.pointer.world)
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
  const [user] = useState<DemoUser>(() => createDemoUser())
  const [roomId, setRoomId] = useState(() => readRoomIdFromUrl())
  const [roomDraft, setRoomDraft] = useState(() => readRoomIdFromUrl())
  const [doc, setDoc] = useState<Document>(() => resolveScenario(scenarios[0].id).create())
  const [instance, setInstance] = useState<WhiteboardInstance | null>(null)
  const [collabStatus, setCollabStatus] = useState<
    Parameters<NonNullable<WhiteboardCollabOptions['onStatusChange']>>[0]
  >('idle')
  const [collabSession, setCollabSession] = useState<
    Parameters<NonNullable<WhiteboardCollabOptions['onSession']>>[0]
  >(null)
  const [awarenessVersion, setAwarenessVersion] = useState(0)
  const [viewportVersion, setViewportVersion] = useState(0)
  const instanceRef = useRef<WhiteboardInstance | null>(null)
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const insertCountRef = useRef(0)
  const lastPointerPublishAtRef = useRef(0)
  const seedScenarioIdRef = useRef(scenarios[0].id)
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

  const collab = useMemo<WhiteboardCollabOptions>(() => ({
    doc: collabBinding.doc,
    provider: collabBinding.provider,
    bootstrap: 'auto',
    autoConnect: true,
    onSession: setCollabSession,
    onStatusChange: setCollabStatus
  }), [collabBinding])

  const activeScenario = useMemo(
    () => resolveScenarioByDocumentId(doc.id),
    [doc.id]
  )

  const stats = useMemo(() => {
    const nodeCount = doc.nodes.order.length
    const edgeCount = doc.edges.order.length
    const mindmapCount = doc.nodes.order.filter((id) => doc.nodes.entities[id]?.type === 'mindmap').length
    return { nodeCount, edgeCount, mindmapCount }
  }, [doc])

  const remotePeers = useMemo(
    () => Array.from(awareness.getStates().entries())
      .filter(([clientId]) => clientId !== awareness.clientId),
    [awareness, awarenessVersion]
  )

  useEffect(() => {
    if (!activeScenario) {
      return
    }
    seedScenarioIdRef.current = activeScenario.id
  }, [activeScenario])

  useEffect(() => {
    return () => {
      collabBinding.destroy()
    }
  }, [collabBinding])

  useEffect(() => {
    const nextScenario = resolveScenario(seedScenarioIdRef.current)
    setDoc(nextScenario.create())
  }, [roomId])

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

    const unsubscribe = instance.viewport.subscribe(() => {
      setViewportVersion((value) => value + 1)
    })

    return () => {
      unsubscribe()
    }
  }, [instance])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    insertCountRef.current = 0
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

  const handleSelect = (id: string) => {
    const scenario = resolveScenario(id)
    setDoc(scenario.create())
  }

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
    const pointer = current.viewport.pointer({
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
      const zoom = instance.viewport.get().zoom
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

  const handleInsertNode = useCallback((
    template: typeof INSERTABLE_NODES[number]
  ) => {
    const instance = instanceRef.current
    if (!instance) return

    const index = insertCountRef.current
    insertCountRef.current += 1

    const column = index % 3
    const row = Math.floor(index / 3) % 3
    const offsetX = (column - 1) * 42
    const offsetY = (row - 1) * 34
    const center = instance.viewport.get().center
    const ownerId = instance.state.frame.get().id
    const id = createId('demo-node')
    const payload: NodeInput = {
      id,
      type: template.type,
      position: {
        x: center.x - template.size.width / 2 + offsetX,
        y: center.y - template.size.height / 2 + offsetY
      },
      size: template.size,
      data: template.data,
      ownerId
    }

    const result = instance.commands.node.create(payload)
    if (!result.ok) return

    instance.commands.selection.replace({
      nodeIds: [id]
    })
  }, [])

  const handleApplyRoom = useCallback(() => {
    const nextRoomId = normalizeRoomId(roomDraft)
    setRoomDraft(nextRoomId)
    if (nextRoomId === roomId) {
      return
    }
    setRoomId(nextRoomId)
    window.history.replaceState({}, '', buildRoomUrl(nextRoomId))
  }, [roomDraft, roomId])

  const handleOpenTab = useCallback(() => {
    window.open(buildRoomUrl(roomId), '_blank', 'noopener,noreferrer')
  }, [roomId])

  const handleResync = useCallback(() => {
    collabSession?.resync()
  }, [collabSession])

  return (
    <div className="demo-root">
      <div className="demo-menu">
        <div className="demo-menu-header">
          <div className="demo-title">Whiteboard Collab Demo</div>
          <div className="demo-subtitle">
            多标签页纯前端协作，文档走 Yjs，指针和选区走 presence。
          </div>
        </div>

        <div className="demo-menu-list">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              className={`demo-menu-item ${activeScenario?.id === scenario.id ? 'active' : ''}`}
              type="button"
              onClick={() => handleSelect(scenario.id)}
            >
              <div className="demo-menu-item-title">{scenario.label}</div>
              <div className="demo-menu-item-desc">{scenario.description}</div>
            </button>
          ))}
        </div>

        <div className="demo-insert-panel">
          <div className="demo-insert-title">插入节点</div>
          <div className="demo-insert-grid">
            {INSERTABLE_NODES.map((template) => (
              <button
                key={template.label}
                className="demo-insert-item"
                type="button"
                onClick={() => handleInsertNode(template)}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-menu-footer">
          <div>节点 {stats.nodeCount} · 连线 {stats.edgeCount} · Mindmap {stats.mindmapCount}</div>
          <div>当前文档 {doc.id}</div>
          <div className="demo-menu-hint">右键拖动画布，打开第二个标签页可立即看到协作。</div>
        </div>
      </div>

      <div className="demo-collab-panel">
        <div className="demo-collab-header">
          <div>
            <div className="demo-collab-title">协作状态</div>
            <div className="demo-collab-subtitle">Room 与当前浏览器标签页绑定。</div>
          </div>
          <div className={`demo-status-badge demo-status-${collabStatus}`}>
            {collabStatus}
          </div>
        </div>

        <div className="demo-room-box">
          <label className="demo-field-label" htmlFor="room-id">Room</label>
          <div className="demo-room-row">
            <input
              id="room-id"
              className="demo-room-input"
              value={roomDraft}
              onChange={(event) => setRoomDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleApplyRoom()
                }
              }}
            />
            <button
              className="demo-collab-button"
              type="button"
              onClick={handleApplyRoom}
            >
              进入
            </button>
          </div>
          <div className="demo-room-actions">
            <button
              className="demo-collab-button"
              type="button"
              onClick={handleOpenTab}
            >
              打开协作标签
            </button>
            <button
              className="demo-collab-button"
              type="button"
              onClick={handleResync}
              disabled={!collabSession}
            >
              重新同步
            </button>
          </div>
        </div>

        <div className="demo-user-card">
          <div
            className="demo-user-swatch"
            style={{ backgroundColor: user.color }}
          />
          <div>
            <div className="demo-user-name">{user.name}</div>
            <div className="demo-user-meta">
              本地标签页 · {remotePeers.length} 个远端协作者
            </div>
          </div>
        </div>

        <div className="demo-peer-list">
          {remotePeers.length === 0 ? (
            <div className="demo-peer-empty">当前房间只有你，打开新标签页即可联机。</div>
          ) : remotePeers.map(([clientId, state]) => (
            <div key={clientId} className="demo-peer-item">
              <div
                className="demo-user-swatch"
                style={{ backgroundColor: state.user.color }}
              />
              <div className="demo-peer-copy">
                <div className="demo-user-name">{state.user.name}</div>
                <div className="demo-user-meta">
                  {state.activity ?? 'idle'} · {formatToolLabel(state.tool)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
            className: 'wb-theme-notion',
            style: { width: '100%', height: '100%' },
            tool: { type: 'select' },
            mindmapLayout: { mode: 'simple' }
          }}
        />
      </div>
    </div>
  )
}
