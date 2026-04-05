import { getEdgePathBounds } from '@whiteboard/core/edge'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useEditorRuntime } from '../../runtime/hooks/useEditor'
import {
  useKeyedStoreValue,
  useStoreValue
} from '../../runtime/hooks/useStoreValue'
import type {
  WhiteboardPresenceBinding,
  WhiteboardPresenceState
} from '../../types/common/presence'
import { formatPresenceToolLabel } from './presence'

const EMPTY_EDGE_PATH = {
  points: [],
  segments: []
} as const

const toScreenRect = (
  editor: ReturnType<typeof useEditorRuntime>,
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
) => {
  const topLeft = editor.read.viewport.worldToScreen({
    x: rect.x,
    y: rect.y
  })
  const bottomRight = editor.read.viewport.worldToScreen({
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

const PresenceNodeSelection = ({
  nodeId,
  color,
  viewport
}: {
  nodeId: string
  color: string
  viewport: unknown
}) => {
  const editor = useEditorRuntime()
  const item = useKeyedStoreValue(editor.read.node.item, nodeId)

  if (!item) {
    return null
  }

  void viewport

  return (
    <div
      className="wb-presence-selection"
      style={{
        ...toScreenRect(editor, editor.read.node.outline(nodeId) ?? item.rect),
        borderColor: color,
        backgroundColor: `${color}18`
      }}
    />
  )
}

const PresenceEdgeSelection = ({
  edgeId,
  color,
  viewport
}: {
  edgeId: string
  color: string
  viewport: unknown
}) => {
  const editor = useEditorRuntime()
  const edge = useKeyedStoreValue(editor.read.edge.resolved, edgeId)

  if (!edge) {
    return null
  }

  void viewport

  const bounds = getEdgePathBounds(edge.path ?? EMPTY_EDGE_PATH)
  if (!bounds) {
    return null
  }

  return (
    <div
      className="wb-presence-selection wb-presence-selection-edge"
      style={{
        ...toScreenRect(editor, bounds),
        borderColor: color,
        backgroundColor: `${color}12`
      }}
    />
  )
}

const PresenceCursor = ({
  peer,
  viewport
}: {
  peer: WhiteboardPresenceState
  viewport: unknown
}) => {
  const editor = useEditorRuntime()

  if (!peer.pointer) {
    return null
  }

  void viewport

  const cursor = editor.read.viewport.worldToScreen(peer.pointer.world)

  return (
    <div
      className="wb-presence-cursor"
      style={{
        left: cursor.x,
        top: cursor.y,
        '--wb-presence-user-color': peer.user.color
      } as CSSProperties}
    >
      <div className="wb-presence-cursor-dot" />
      <div className="wb-presence-cursor-label">
        <strong>{peer.user.name}</strong>
        <span>{peer.activity ?? 'idle'} · {formatPresenceToolLabel(peer.tool)}</span>
      </div>
    </div>
  )
}

const PresencePeer = ({
  clientId,
  peer,
  viewport
}: {
  clientId: string
  peer: WhiteboardPresenceState
  viewport: unknown
}) => {
  const selection = peer.selection

  return (
    <div>
      {selection?.nodeIds.map((nodeId) => (
        <PresenceNodeSelection
          key={`node-${clientId}-${nodeId}`}
          nodeId={nodeId}
          color={peer.user.color}
          viewport={viewport}
        />
      ))}
      {selection?.edgeIds.map((edgeId) => (
        <PresenceEdgeSelection
          key={`edge-${clientId}-${edgeId}`}
          edgeId={edgeId}
          color={peer.user.color}
          viewport={viewport}
        />
      ))}
      <PresenceCursor
        peer={peer}
        viewport={viewport}
      />
    </div>
  )
}

export const PresenceLayer = ({
  binding
}: {
  binding?: WhiteboardPresenceBinding
}) => {
  const editor = useEditorRuntime()
  const viewport = useStoreValue(editor.state.viewport)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!binding) {
      setVersion(0)
      return
    }

    return binding.subscribe(() => {
      setVersion((value) => value + 1)
    })
  }, [binding])

  const peers = useMemo(() => {
    if (!binding) {
      return []
    }

    return Array.from(binding.getStates().entries())
      .filter(([clientId]) => clientId !== binding.clientId)
  }, [binding, version])

  if (peers.length === 0) {
    return null
  }

  return (
    <div className="wb-presence-layer">
      {peers.map(([clientId, peer]) => (
        <PresencePeer
          key={clientId}
          clientId={clientId}
          peer={peer}
          viewport={viewport}
        />
      ))}
    </div>
  )
}
