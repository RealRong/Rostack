import {
  memo
} from 'react'
import {
  useStoreValue
} from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { NodeBodyItem } from '@whiteboard/react/features/node/components/NodeBodyItem'
import { EdgeSceneLayer } from '@whiteboard/react/features/edge/components/EdgeSceneLayer'
import { MindmapSceneItem } from '@whiteboard/react/features/mindmap/components/MindmapSceneItem'
import { EdgeCanvasMarkerDefs } from '@whiteboard/react/features/edge/ui/marker'

export const CanvasScene = memo(() => {
  const editor = useEditorRuntime()
  const itemIds = useStoreValue(editor.projection.stores.items.ids)
  return (
    <div className="wb-scene">
      <svg className="wb-scene-defs" aria-hidden="true" focusable="false">
        <defs>
          <EdgeCanvasMarkerDefs />
        </defs>
      </svg>
      <EdgeSceneLayer />
      {itemIds.map((itemKey) => {
        const ref = editor.projection.stores.items.byId.get(itemKey)
        if (!ref) {
          return null
        }

        return ref.kind === 'mindmap'
            ? (
                <MindmapSceneItem
                  key={`mindmap:${ref.id}`}
                  mindmapId={ref.id}
                />
              )
          : ref.kind === 'node'
            ? (
              <NodeBodyItem
                key={`node:${ref.id}`}
                nodeId={ref.id}
              />
            )
            : null
      })}
    </div>
  )
})

CanvasScene.displayName = 'CanvasScene'
