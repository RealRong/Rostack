import {
  memo
} from 'react'
import type { SelectionOverlay as EditorSelectionOverlay } from '@whiteboard/editor'
import type { Guide } from '@whiteboard/core/node'
import type { NodeId } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  usePickRef
} from '@whiteboard/react/runtime/hooks'
import { useNodeOverlayView } from '@whiteboard/react/features/node/hooks/useNodeView'
import { NodeConnectHandles } from '@whiteboard/react/features/node/components/NodeConnectHandles'
import {
  NodeTransformHandles,
  TransformHandles
} from '@whiteboard/react/features/node/components/NodeTransformHandles'

const NodeInteractionGuidesLayer = ({
  guides
}: {
  guides: readonly Guide[]
}) => {
  if (!guides.length) return null

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-drag-guides-layer"
    >
      {guides.map((guide, index) => (
        <line
          key={`${guide.axis}-${index}`}
          x1={guide.axis === 'x' ? guide.value : guide.from}
          y1={guide.axis === 'x' ? guide.from : guide.value}
          x2={guide.axis === 'x' ? guide.value : guide.to}
          y2={guide.axis === 'x' ? guide.to : guide.value}
          stroke="rgb(from var(--ui-accent) r g b / 0.9)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}
    </svg>
  )
}

const NodeTransformOverlayItem = memo(({
  nodeId,
  showHandles
}: {
  nodeId: NodeId
  showHandles: boolean
}) => {
  const view = useNodeOverlayView(nodeId)

  if (!view) return null

  return (
    <>
      <div
        className="wb-node-transform-frame"
        style={view.transformFrameStyle}
      />
      {showHandles && !view.node.locked ? (
        <NodeTransformHandles
          node={view.node}
          rect={view.rect}
          rotation={view.rotation}
          canResize={view.canResize}
          canRotate={view.canRotate}
        />
      ) : null}
    </>
  )
})

NodeTransformOverlayItem.displayName = 'NodeTransformOverlayItem'

const EdgeConnectOverlay = () => {
  const editor = useEditorRuntime()
  const chrome = useStoreValue(editor.read.chrome)
  const hint = chrome.edgeGuide
  const connect = hint.connect
  const view = useNodeOverlayView(connect?.focusedNodeId)

  if (!view || !view.canConnect || view.node.locked) return null

  const activeSide = connect?.resolution.mode === 'handle'
    ? connect.resolution.side
    : undefined

  return (
    <NodeConnectHandles
      node={view.node}
      rect={view.rect}
      rotation={view.rotation}
      activeSide={activeSide}
    />
  )
}

const SelectionFrameOverlay = ({
  overlay
}: {
  overlay: Extract<EditorSelectionOverlay, { kind: 'selection' }>
}) => {
  if (!overlay.frame) {
    return null
  }

  const interactive = overlay.interactive
  const ref = usePickRef({
    kind: 'selection-box',
    part: 'body'
  })
  const box = overlay.box

  return (
    <div
      ref={interactive ? ref : undefined}
      className="wb-selection-transform-box"
      style={{
        pointerEvents: interactive ? 'auto' : 'none',
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.width,
        height: box.height
      }}
    />
  )
}

const SelectionHandlesOverlay = ({
  overlay
}: {
  overlay: Extract<EditorSelectionOverlay, { kind: 'selection' }>
}) => {
  if (!overlay.handles) {
    return null
  }

  return (
    <TransformHandles
      rect={overlay.box}
      rotation={0}
      canResize={overlay.canResize}
      canRotate={false}
    />
  )
}

export const NodeOverlayLayer = () => {
  const editor = useEditorRuntime()
  const chrome = useStoreValue(editor.read.chrome)
  const guides = chrome.snap
  const overlay = chrome.selection

  return (
    <>
      <div className="wb-node-overlay-layer">
        {overlay?.kind === 'node' ? (
          <NodeTransformOverlayItem
            nodeId={overlay.nodeId}
            showHandles={overlay.handles}
          />
        ) : null}
        {overlay?.kind === 'selection' && overlay.frame ? (
          <SelectionFrameOverlay
            overlay={overlay}
          />
        ) : null}
        {overlay?.kind === 'selection' && overlay.handles ? (
          <SelectionHandlesOverlay
            overlay={overlay}
          />
        ) : null}
        <EdgeConnectOverlay />
      </div>
      <NodeInteractionGuidesLayer guides={guides} />
    </>
  )
}
