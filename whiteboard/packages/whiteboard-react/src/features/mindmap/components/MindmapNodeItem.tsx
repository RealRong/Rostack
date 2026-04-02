import type { CSSProperties } from 'react'
import type { MindmapNodeId, NodeId, Rect } from '@whiteboard/core/types'
import { usePickRef } from '../../../runtime/hooks/usePickRef'

const MINDMAP_NODE_DEFAULT_BORDER = 1
const MINDMAP_NODE_ACTIVE_BORDER = 2
const MINDMAP_NODE_TRANSITION = 'transform 160ms ease, opacity 160ms ease'
const MINDMAP_ADD_PLACEMENTS = ['up', 'down', 'left', 'right'] as const

type MindmapNodeItemProps = {
  treeId: NodeId
  id: MindmapNodeId
  rect: Rect
  shiftX: number
  shiftY: number
  label: string
  dragActive: boolean
  attachTarget: boolean
  showActions: boolean
  dragPreviewActive: boolean
  onAddChild: (nodeId: MindmapNodeId, placement: 'left' | 'right' | 'up' | 'down') => void
}

export const MindmapNodeItem = ({
  treeId,
  id,
  rect,
  shiftX,
  shiftY,
  label,
  dragActive,
  attachTarget,
  showActions,
  dragPreviewActive,
  onAddChild
}: MindmapNodeItemProps) => {
  const ref = usePickRef({
    kind: 'mindmap',
    treeId,
    nodeId: id
  })
  const transition = dragPreviewActive ? 'none' : MINDMAP_NODE_TRANSITION
  const borderWidth = attachTarget ? MINDMAP_NODE_ACTIVE_BORDER : MINDMAP_NODE_DEFAULT_BORDER

  return (
    <div
      ref={ref}
      data-mindmap-node-id={id}
      data-drag-active={dragActive ? 'true' : undefined}
      data-drag-preview-active={dragPreviewActive ? 'true' : undefined}
      className="wb-mindmap-node-item"
      style={{
        '--wb-mindmap-node-w': `${rect.width}px`,
        '--wb-mindmap-node-h': `${rect.height}px`,
        '--wb-mindmap-node-border-w': borderWidth,
        '--wb-mindmap-node-opacity': dragActive ? 0.35 : 1,
        '--wb-mindmap-node-transition': transition,
        '--wb-mindmap-node-tx': `${rect.x + shiftX}px`,
        '--wb-mindmap-node-ty': `${rect.y + shiftY}px`,
        '--wb-mindmap-node-border-color': attachTarget
          ? 'hsl(var(--ui-accent, 209.8 76.7% 51.2%))'
          : 'hsl(var(--ui-text-primary, 40 2.1% 28%))'
      } as CSSProperties}
      data-attach-target={attachTarget ? 'true' : undefined}
    >
      <div className="wb-mindmap-node-label">{label}</div>
      {showActions && (
        <div className="wb-mindmap-node-actions" data-selection-ignore>
          {MINDMAP_ADD_PLACEMENTS.map((placement) => (
            <button
              key={placement}
              type="button"
              className="wb-mindmap-add-button"
              data-placement={placement}
              data-input-ignore
              data-selection-ignore
              onClick={() => onAddChild(id, placement)}
            >
              +
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
