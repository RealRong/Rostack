import { Plus } from 'lucide-react'
import { useEdit } from '@whiteboard/react/runtime/hooks'
import type { MindmapTreeViewData } from '@whiteboard/react/types/mindmap'

type MindmapTreeChromeProps = {
  view: MindmapTreeViewData
  selectedNodeIds: readonly string[]
}

export const MindmapTreeChrome = ({
  view,
  selectedNodeIds
}: MindmapTreeChromeProps) => {
  const edit = useEdit()
  const rootSelected = selectedNodeIds.includes(view.rootNodeId)
  const rootEditing = edit?.kind === 'node' && edit.nodeId === view.rootNodeId

  if (!rootSelected || rootEditing || view.rootLocked) {
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
        transform: `translate(${view.rootRect.x + view.rootRect.width + 12}px, ${view.rootRect.y + Math.max(view.rootRect.height / 2 - 14, 0)}px)`
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        view.onAddChild(view.rootNodeId, 'right')
      }}
    >
      <Plus size={16} strokeWidth={2.2} />
    </button>
  )
}
