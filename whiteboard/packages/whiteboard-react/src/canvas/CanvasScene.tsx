import {
  memo
} from 'react'
import {
  useStoreValue
} from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { NodeBodyItem } from '@whiteboard/react/features/node/components/NodeBodyItem'
import { EdgeItem } from '@whiteboard/react/features/edge/components/EdgeItem'
import { MindmapSceneItem } from '@whiteboard/react/features/mindmap/components/MindmapSceneItem'
import { EdgeCanvasMarkerDefs } from '@whiteboard/react/features/edge/ui/marker'

export const CanvasScene = memo(() => {
  const editor = useEditorRuntime()
  const scene = useStoreValue(editor.read.items)
  console.log(scene === scene, editor === editor)
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
          : ref.kind === 'mindmap'
            ? (
                <MindmapSceneItem
                  key={`mindmap:${ref.id}`}
                  mindmapId={ref.id}
                />
              )
          : (
              <NodeBodyItem
                key={`node:${ref.id}`}
                nodeId={ref.id}
              />
            )
      ))}
    </div>
  )
})

CanvasScene.displayName = 'CanvasScene'
