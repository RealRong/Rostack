import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { useKeyedStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import type {
  WhiteboardPresenceBinding,
  WhiteboardPresenceState
} from '@whiteboard/react/types/common/presence'
import { formatPresenceToolLabel } from '@whiteboard/react/features/collab/presence'

type PresenceCursorStyle = CSSProperties & {
  '--wb-presence-user-color': string
}

const PresenceNodeSelection = ({
  nodeId,
  color
}: {
  nodeId: string
  color: string
}) => {
  const editor = useEditorRuntime()
  const selectionRef = useRef<HTMLDivElement | null>(null)
  const item = useKeyedStoreValue(editor.scene.stores.render.node.byId, nodeId)
  const bounds = item?.bounds
  const screenBounds = bounds
    ? editor.viewport.screenRect(bounds)
    : undefined

  useLayoutEffect(() => {
    if (!bounds) {
      return
    }

    const applyBounds = () => {
      if (!selectionRef.current) {
        return
      }

      const nextBounds = editor.viewport.screenRect(bounds)
      selectionRef.current.style.left = `${nextBounds.x}px`
      selectionRef.current.style.top = `${nextBounds.y}px`
      selectionRef.current.style.width = `${nextBounds.width}px`
      selectionRef.current.style.height = `${nextBounds.height}px`
    }

    applyBounds()

    return editor.scene.ui.state.viewport.subscribe(applyBounds)
  }, [bounds, editor])

  if (!screenBounds) {
    return null
  }

  return (
    <div
      ref={selectionRef}
      className="wb-presence-selection"
      style={{
        left: screenBounds.x,
        top: screenBounds.y,
        width: screenBounds.width,
        height: screenBounds.height,
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
  const selectionRef = useRef<HTMLDivElement | null>(null)
  const edge = useKeyedStoreValue(editor.scene.stores.graph.edge.byId, edgeId)
  const bounds = edge?.box?.rect
  const screenBounds = bounds
    ? editor.viewport.screenRect(bounds)
    : undefined

  useLayoutEffect(() => {
    if (!bounds) {
      return
    }

    const applyBounds = () => {
      if (!selectionRef.current) {
        return
      }

      const nextBounds = editor.viewport.screenRect(bounds)
      selectionRef.current.style.left = `${nextBounds.x}px`
      selectionRef.current.style.top = `${nextBounds.y}px`
      selectionRef.current.style.width = `${nextBounds.width}px`
      selectionRef.current.style.height = `${nextBounds.height}px`
    }

    applyBounds()

    return editor.scene.ui.state.viewport.subscribe(applyBounds)
  }, [bounds, editor])

  if (!screenBounds) {
    return null
  }

  return (
    <div
      ref={selectionRef}
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
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const pointer = peer.pointer
  const cursor = pointer
    ? editor.viewport.worldToScreen(pointer.world)
    : undefined

  useLayoutEffect(() => {
    if (!pointer) {
      return
    }

    const applyCursor = () => {
      if (!cursorRef.current) {
        return
      }

      const nextCursor = editor.viewport.worldToScreen(pointer.world)
      cursorRef.current.style.left = `${nextCursor.x}px`
      cursorRef.current.style.top = `${nextCursor.y}px`
    }

    applyCursor()

    return editor.scene.ui.state.viewport.subscribe(applyCursor)
  }, [editor, pointer])

  if (!cursor) {
    return null
  }

  const cursorStyle: PresenceCursorStyle = {
    left: cursor.x,
    top: cursor.y,
    '--wb-presence-user-color': peer.user.color
  }

  return (
    <div
      ref={cursorRef}
      className="wb-presence-cursor"
      style={cursorStyle}
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
