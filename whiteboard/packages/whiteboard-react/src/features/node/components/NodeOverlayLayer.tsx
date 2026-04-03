import {
  memo
} from 'react'
import type { Guide } from '@whiteboard/core/node'
import type { NodeId } from '@whiteboard/core/types'
import {
  useEditorRuntime
} from '../../../runtime/hooks/useEditor'
import { usePickRef } from '../../../runtime/hooks/usePickRef'
import { useStoreValue } from '../../../runtime/hooks/useStoreValue'
import { useNodeOverlayView } from '../hooks/useNodeView'
import { useSelectionPresentation } from '../selection'
import { NodeConnectHandles } from './NodeConnectHandles'
import {
  NodeTransformHandles,
  TransformHandles
} from './NodeTransformHandles'

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

const NodeConnectOverlayItem = memo(({
  nodeId
}: {
  nodeId: NodeId
}) => {
  const view = useNodeOverlayView(nodeId)

  if (!view || !view.canConnect) return null

  return (
    <NodeConnectHandles
      node={view.node}
      rect={view.rect}
      rotation={view.rotation}
    />
  )
})

NodeConnectOverlayItem.displayName = 'NodeConnectOverlayItem'

const EMPTY_NODE_IDS: readonly NodeId[] = []

const SelectionFrameOverlay = ({
  presentation
}: {
  presentation: ReturnType<typeof useSelectionPresentation>
}) => {
  const interactive = presentation.selection.boxState.interactive
  const ref = usePickRef({
    kind: 'selection-box',
    part: 'body'
  })

  if (
    !presentation.selection.boxState.frame
    || !presentation.selection.boxState.box
  ) {
    return null
  }

  return (
    <div
      ref={interactive ? ref : undefined}
      className="wb-selection-transform-box"
      style={{
        pointerEvents: interactive ? 'auto' : 'none',
        transform: `translate(${presentation.selection.boxState.box.x}px, ${presentation.selection.boxState.box.y}px)`,
        width: presentation.selection.boxState.box.width,
        height: presentation.selection.boxState.box.height
      }}
    />
  )
}

const SelectionHandlesOverlay = ({
  presentation
}: {
  presentation: ReturnType<typeof useSelectionPresentation>
}) => {
  if (
    !presentation.selection.boxState.handles
    || !presentation.selection.boxState.box
  ) {
    return null
  }

  return (
    <TransformHandles
      rect={presentation.selection.boxState.box}
      rotation={0}
      canResize={presentation.selection.boxState.canResize}
      canRotate={false}
    />
  )
}

export const NodeOverlayLayer = () => {
  const editor = useEditorRuntime()
  const guides = useStoreValue(editor.read.overlay.feedback.snap)
  const presentation = useSelectionPresentation()
  const connectNodeIds = presentation.connectNodeIds.length > 0
    ? presentation.connectNodeIds
    : EMPTY_NODE_IDS

  return (
    <>
      <div className="wb-node-overlay-layer">
        {presentation.singleTransformNodeId ? (
          <NodeTransformOverlayItem
            nodeId={presentation.singleTransformNodeId}
            showHandles={presentation.chrome.transform}
          />
        ) : null}
        {presentation.showSelectionFrame ? (
          <SelectionFrameOverlay
            presentation={presentation}
          />
        ) : null}
        {presentation.showSelectionHandles ? (
          <SelectionHandlesOverlay
            presentation={presentation}
          />
        ) : null}
        {connectNodeIds.map((nodeId) => (
          <NodeConnectOverlayItem
            key={`connect:${nodeId}`}
            nodeId={nodeId}
          />
        ))}
      </div>
      <NodeInteractionGuidesLayer guides={guides} />
    </>
  )
}
