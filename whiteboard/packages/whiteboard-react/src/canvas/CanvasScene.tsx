import type { NodeId } from '@whiteboard/core/types'
import {
  useStoreValue
} from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { useNodeSizeObserver } from '@whiteboard/react/features/node/dom/nodeSizeObserver'
import { NodeItem } from '@whiteboard/react/features/node/components/NodeItem'
import { EdgeItem } from '@whiteboard/react/features/edge/components/EdgeItem'
import { useEdgeLabelSizeObserver } from '@whiteboard/react/features/edge/dom/labelSizeObserver'
import { EdgeCanvasMarkerDefs } from '@whiteboard/react/features/edge/ui/glyphs'

export const CanvasScene = () => {
  const editor = useEditorRuntime()
  const scene = useStoreValue(editor.read.scene.list)
  const selection = useStoreValue(editor.store.selection)
  const registerMeasuredElement = useNodeSizeObserver()
  const edgeLabelObserver = useEdgeLabelSizeObserver()

  return (
    <div className="wb-scene">
      <svg className="wb-scene-defs" aria-hidden="true" focusable="false">
        <defs>
          <EdgeCanvasMarkerDefs />
        </defs>
      </svg>
      {scene.map((ref) => (
        ref.kind === 'edge'
          ? (
              <EdgeItem
                key={`edge:${ref.id}`}
                edgeId={ref.id}
                selected={selection.edgeIds.includes(ref.id)}
                edgeLabelObserver={edgeLabelObserver}
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
