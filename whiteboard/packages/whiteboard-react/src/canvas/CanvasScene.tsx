import {
  useStoreValue
} from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { NodeItem } from '@whiteboard/react/features/node/components/NodeItem'
import { EdgeItem } from '@whiteboard/react/features/edge/components/EdgeItem'
import { EdgeCanvasMarkerDefs } from '@whiteboard/react/features/edge/ui/marker'

export const CanvasScene = () => {
  const editor = useEditorRuntime()
  const scene = useStoreValue(editor.read.scene.list)

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
              />
            )
          : (
              <NodeItem
                key={`node:${ref.id}`}
                nodeId={ref.id}
              />
            )
      ))}
    </div>
  )
}
