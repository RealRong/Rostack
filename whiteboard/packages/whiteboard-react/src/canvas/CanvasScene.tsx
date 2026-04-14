import type { NodeId } from '@whiteboard/core/types'
import {
  useStoreValue
} from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { useNodeSizeObserver } from '@whiteboard/react/features/node/dom/nodeSizeObserver'
import { NodeItem } from '@whiteboard/react/features/node/components/NodeItem'
import { EdgeItem } from '@whiteboard/react/features/edge/components/EdgeItem'
import {
  EDGE_ARROW_END_ID,
  EDGE_ARROW_START_ID
} from '@whiteboard/react/features/edge/constants'

export const CanvasScene = () => {
  const editor = useEditorRuntime()
  const scene = useStoreValue(editor.read.scene.list)
  const selection = useStoreValue(editor.store.selection)
  const registerMeasuredElement = useNodeSizeObserver()

  return (
    <div className="wb-scene">
      <svg className="wb-scene-defs" aria-hidden="true" focusable="false">
        <defs>
          <marker
            id={EDGE_ARROW_END_ID}
            markerWidth="10"
            markerHeight="10"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" stroke="currentColor" />
          </marker>
          <marker
            id={EDGE_ARROW_START_ID}
            markerWidth="10"
            markerHeight="10"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" stroke="currentColor" />
          </marker>
        </defs>
      </svg>
      {scene.map((ref) => (
        ref.kind === 'edge'
          ? (
              <EdgeItem
                key={`edge:${ref.id}`}
                edgeId={ref.id}
                selected={selection.edgeIds.includes(ref.id)}
              />
            )
          : (
              <NodeItem
                key={`node:${ref.id}`}
                nodeId={ref.id}
                registerMeasuredElement={registerMeasuredElement}
                selected={selection.nodeIds.includes(ref.id)}
              />
            )
      ))}
    </div>
  )
}
