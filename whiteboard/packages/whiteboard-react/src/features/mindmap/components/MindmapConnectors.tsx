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
  const mindmap = useOptionalKeyedStoreValue(
    editor.scene.mindmap.view,
    mindmapId,
    undefined
  )

  const bbox = mindmap?.tree.bbox
  if (!mindmap || !bbox) {
    return null
  }

  return (
    <div
      className="wb-mindmap-tree"
      data-mindmap-id={mindmapId}
      style={{
        width: bbox.width,
        height: bbox.height,
        transform: `translate(${bbox.x}px, ${bbox.y}px)`,
        pointerEvents: 'none'
      }}
    >
      <svg
        width={bbox.width}
        height={bbox.height}
        viewBox={`${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`}
        className="wb-mindmap-tree-canvas"
      >
        {mindmap.render.connectors.map((connector) => (
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
