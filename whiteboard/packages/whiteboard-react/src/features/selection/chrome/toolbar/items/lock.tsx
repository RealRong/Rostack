import { ToolbarIconButton } from '@shared/ui'
import { Lock } from 'lucide-react'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const lockItem: ToolbarItemSpec = {
  key: 'lock',
  renderButton: ({
    activeScope,
    context,
    editor
  }) => {
    const edge = activeScope.edge
    const node = activeScope.node
    const locked = edge
      ? edge.lock === 'all'
      : context.locked === 'all'
    const title = locked ? 'Unlock' : 'Lock'

    return (
      <ToolbarIconButton
        active={locked}
        title={title}
        onClick={() => {
          if (edge) {
            editor.actions.edge.lock.set(edge.edgeIds, !locked)
            return
          }

          if (node) {
            editor.actions.node.lock.set(node.nodeIds, !locked)
          }
        }}
      >
        <Lock size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}
