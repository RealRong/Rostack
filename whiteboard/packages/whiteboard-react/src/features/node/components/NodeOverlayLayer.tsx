import {
  memo
} from 'react'
import type { SelectionPresentation as EditorSelectionPresentation } from '@whiteboard/editor'
import type { Guide } from '@whiteboard/core/node'
import type { NodeId } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  usePickRef
} from '#react/runtime/hooks'
import { useNodeOverlayView } from '../hooks/useNodeView'
import { NodeConnectHandles } from './NodeConnectHandles'
import {
  NodeTransformHandles,
  TransformHandles
} from './NodeTransformHandles'

type ActiveSelectionPresentation = Exclude<EditorSelectionPresentation, { kind: 'none' }>

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
          stroke="var(--wb-selection-border)"
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
          rect={view.transformRect}
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
  const hint = useStoreValue(editor.read.overlay.feedback.edgeGuide)
  const connect = hint.connect
  const view = useNodeOverlayView(connect?.focusedNodeId)

  if (!view || !view.canConnect) return null

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
  presentation
}: {
  presentation: ActiveSelectionPresentation
}) => {
  if (presentation.overlay.kind !== 'selection' || !presentation.overlay.frame) {
    return null
  }

  const interactive = presentation.overlay.interactive
  const ref = usePickRef({
    kind: 'selection-box',
    part: 'body'
  })
  const box = presentation.geometry.box

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
  presentation
}: {
  presentation: ActiveSelectionPresentation
}) => {
  if (presentation.overlay.kind !== 'selection' || !presentation.overlay.handles) {
    return null
  }
  const transformBox = presentation.geometry.transformBox
  if (!transformBox) {
    return null
  }

  return (
    <TransformHandles
      rect={transformBox}
      rotation={0}
      canResize={presentation.overlay.canResize}
      canRotate={false}
    />
  )
}

export const NodeOverlayLayer = () => {
  const editor = useEditorRuntime()
  const guides = useStoreValue(editor.read.overlay.feedback.snap)
  const presentation = useStoreValue(editor.read.selection.presentation)

  return (
    <>
      <div className="wb-node-overlay-layer">
        {presentation.kind !== 'none' && presentation.overlay.kind === 'node' ? (
          <NodeTransformOverlayItem
            nodeId={presentation.overlay.nodeId}
            showHandles={presentation.overlay.handles}
          />
        ) : null}
        {presentation.kind !== 'none' && presentation.overlay.kind === 'selection' && presentation.overlay.frame ? (
          <SelectionFrameOverlay
            presentation={presentation}
          />
        ) : null}
        {presentation.kind !== 'none' && presentation.overlay.kind === 'selection' && presentation.overlay.handles ? (
          <SelectionHandlesOverlay
            presentation={presentation}
          />
        ) : null}
        <EdgeConnectOverlay />
      </div>
      <NodeInteractionGuidesLayer guides={guides} />
    </>
  )
}
