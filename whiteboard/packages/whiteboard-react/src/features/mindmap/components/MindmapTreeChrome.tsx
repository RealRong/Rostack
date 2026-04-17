import { Plus } from 'lucide-react'
import type { MindmapTreeViewData } from '@whiteboard/react/types/mindmap'

type MindmapTreeChromeProps = {
  view: MindmapTreeViewData
}

export const MindmapTreeChrome = ({
  view
}: MindmapTreeChromeProps) => {
  if (view.addChildren.length === 0) {
    return null
  }

  return (
    <>
      {view.addChildren.map((entry) => (
        <button
          key={`${entry.targetNodeId}:${entry.placement}`}
          type="button"
          className="wb-mindmap-add-child-button"
          aria-label="Add child node"
          title="Add child"
          data-input-ignore="true"
          data-selection-ignore="true"
          data-context-menu-ignore="true"
          style={{
            transform: `translate(${entry.x}px, ${entry.y}px)`
          }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            view.onAddChild(entry.targetNodeId, entry.placement)
          }}
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      ))}
    </>
  )
}
