import { memo } from 'react'
import type { MindmapId } from '@whiteboard/core/types'
import { useOptionalKeyedStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

type MindmapConnectorsProps = {
  mindmapId: MindmapId
}

const strokeDasharray = (
  stroke: 'solid' | 'dashed' | 'dotted'
) => {
  switch (stroke) {
    case 'dashed':
      return '6 4'
    case 'dotted':
      return '2 4'
    default:
      return undefined
  }
}

export const MindmapConnectors = memo(({
  mindmapId
}: MindmapConnectorsProps) => {
  const editor = useEditorRuntime()
  const scene = useOptionalKeyedStoreValue(
    editor.read.mindmap.scene,
    mindmapId,
    undefined
  )

  if (!scene) {
    return null
  }

  return (
    <div
      className="wb-mindmap-tree"
      data-mindmap-id={mindmapId}
      style={{
        width: scene.bbox.width,
        height: scene.bbox.height,
        transform: `translate(${scene.bbox.x}px, ${scene.bbox.y}px)`,
        pointerEvents: 'none'
      }}
    >
      <svg
        width={scene.bbox.width}
        height={scene.bbox.height}
        viewBox={`${scene.bbox.x} ${scene.bbox.y} ${scene.bbox.width} ${scene.bbox.height}`}
        className="wb-mindmap-tree-canvas"
      >
        {scene.connectors.map((connector) => (
          <path
            key={connector.id}
            d={connector.path}
            fill="none"
            stroke={connector.style.color}
            strokeWidth={connector.style.width}
            strokeDasharray={strokeDasharray(connector.style.stroke)}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
})

MindmapConnectors.displayName = 'MindmapConnectors'
