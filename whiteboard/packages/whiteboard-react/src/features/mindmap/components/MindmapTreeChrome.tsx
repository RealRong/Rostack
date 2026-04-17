import { Plus } from 'lucide-react'
import type { MindmapTreeViewData } from '@whiteboard/react/types/mindmap'

type MindmapTreeChromeProps = {
  view: MindmapTreeViewData
}

export const MindmapTreeChrome = ({
  view
}: MindmapTreeChromeProps) => {
  const addChild = view.addChild

  if (!addChild?.visible) {
    return null
  }

  return (
    <button
      type="button"
      className="wb-mindmap-add-child-button"
      aria-label="Add child node"
      title="Add child"
      data-input-ignore="true"
      data-selection-ignore="true"
      data-context-menu-ignore="true"
      style={{
        transform: `translate(${addChild.x}px, ${addChild.y}px)`
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        view.onAddChild(view.rootNodeId, addChild.placement)
      }}
    >
      <Plus size={16} strokeWidth={2.2} />
    </button>
  )
}
