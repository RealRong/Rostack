import { memo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import type { MindmapId, MindmapNodeId } from '@whiteboard/core/types'
import { useOptionalKeyedStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

type MindmapChromeProps = {
  mindmapId: MindmapId
}

const DEFAULT_INSERT_BEHAVIOR = {
  focus: 'edit-new',
  enter: 'from-anchor'
} as const

export const MindmapChrome = memo(({
  mindmapId
}: MindmapChromeProps) => {
  const editor = useEditorRuntime()
  const chrome = useOptionalKeyedStoreValue(
    editor.scene.mindmap.chrome.addChildTargets,
    mindmapId,
    undefined
  )

  const onAddChild = useCallback(
    (nodeId: MindmapNodeId, placement: 'left' | 'right') => {
      editor.write.mindmap.insertRelative({
        id: mindmapId,
        targetNodeId: nodeId,
        relation: 'child',
        side: placement,
        payload: {
          kind: 'text',
          text: ''
        },
        behavior: DEFAULT_INSERT_BEHAVIOR
      })
    },
    [editor, mindmapId]
  )

  if (!chrome || chrome.addChildTargets.length === 0) {
    return null
  }

  return (
    <>
      {chrome.addChildTargets.map((entry) => (
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
            onAddChild(entry.targetNodeId, entry.placement)
          }}
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      ))}
    </>
  )
})

MindmapChrome.displayName = 'MindmapChrome'
