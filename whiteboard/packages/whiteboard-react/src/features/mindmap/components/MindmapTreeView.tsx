import type { NodeId } from '@whiteboard/core/types'
import { CanvasNodeSceneItem } from '@whiteboard/react/features/node/components/CanvasNodeSceneItem'
import type { MindmapTreeViewData } from '@whiteboard/react/types/mindmap'

type MindmapTreeViewProps = {
  view: MindmapTreeViewData
  registerMeasuredElement: (
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => void
  selectedNodeIds: readonly NodeId[]
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

export const MindmapTreeView = ({
  view,
  registerMeasuredElement,
  selectedNodeIds
}: MindmapTreeViewProps) => {
  const selectedSet = new Set(selectedNodeIds)

  return (
    <>
      <div
        className="wb-mindmap-tree"
        data-mindmap-tree-id={view.treeId}
        style={{
          width: view.bbox.width,
          height: view.bbox.height,
          transform: `translate(${view.bbox.x}px, ${view.bbox.y}px)`,
          pointerEvents: 'none'
        }}
      >
        <svg
          width={view.bbox.width}
          height={view.bbox.height}
          viewBox={`${view.bbox.x} ${view.bbox.y} ${view.bbox.width} ${view.bbox.height}`}
          className="wb-mindmap-tree-canvas"
        >
          {view.connectors.map((connector) => (
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
      <CanvasNodeSceneItem
        nodeId={view.rootNodeId}
        registerMeasuredElement={registerMeasuredElement}
        selected={selectedSet.has(view.rootNodeId)}
      />
      {view.childNodeIds.map((nodeId) => (
        <CanvasNodeSceneItem
          key={nodeId}
          nodeId={nodeId}
          registerMeasuredElement={registerMeasuredElement}
          selected={selectedSet.has(nodeId)}
        />
      ))}
    </>
  )
}
