import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import type {
  WhiteboardPresenceBinding,
  WhiteboardPresenceState
} from '@whiteboard/react/types/common/presence'
import { formatPresenceToolLabel } from '@whiteboard/react/features/collab/presence'

const PresenceNodeSelection = ({
  nodeId,
  color
}: {
  nodeId: string
  color: string
}) => {
  const editor = useEditorRuntime()
  const item = useKeyedStoreValue(editor.scene.stores.render.node.byId, nodeId)

  if (!item) {
    return null
  }

  const bounds = editor.scene.query.view.screenRect(item.bounds)

  return (
    <div
      className="wb-presence-selection"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        borderColor: color,
        backgroundColor: `${color}18`
      }}
    />
  )
}

const PresenceEdgeSelection = ({
  edgeId,
  color
}: {
  edgeId: string
  color: string
}) => {
  const editor = useEditorRuntime()
  const edge = useKeyedStoreValue(editor.scene.stores.graph.edge.byId, edgeId)

  if (!edge) {
    return null
  }

  const bounds = edge?.box?.rect
  if (!bounds) {
    return null
  }

  const screenBounds = editor.scene.query.view.screenRect(bounds)

  return (
    <div
      className="wb-presence-selection wb-presence-selection-edge"
      style={{
        left: screenBounds.x,
        top: screenBounds.y,
        width: screenBounds.width,
        height: screenBounds.height,
        borderColor: color,
        backgroundColor: `${color}12`
      }}
    />
  )
}

const PresenceCursor = ({
  peer
}: {
  peer: WhiteboardPresenceState
}) => {
  const editor = useEditorRuntime()

  if (!peer.pointer) {
    return null
  }

  const cursor = editor.scene.query.view.screenPoint(peer.pointer.world)

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
  peer
}: {
  clientId: string
  peer: WhiteboardPresenceState
}) => {
  const selection = peer.selection

  return (
    <div>
      {selection?.nodeIds.map((nodeId) => (
        <PresenceNodeSelection
          key={`node-${clientId}-${nodeId}`}
          nodeId={nodeId}
          color={peer.user.color}
        />
      ))}
      {selection?.edgeIds.map((edgeId) => (
        <PresenceEdgeSelection
          key={`edge-${clientId}-${edgeId}`}
          edgeId={edgeId}
          color={peer.user.color}
        />
      ))}
      <PresenceCursor
        peer={peer}
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
  void viewport
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
        />
      ))}
    </div>
  )
}
