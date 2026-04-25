import { Group, Ungroup } from 'lucide-react'
import { ToolbarIconButton } from '@shared/ui'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const groupItem: ToolbarItemSpec = {
  key: 'group',
  units: 1,
  renderButton: ({
    context,
    editor,
    selectionCan
  }) => {
    const canGroup = selectionCan.makeGroup
    const canUngroup = selectionCan.ungroup
    const label = canGroup ? 'Group' : 'Ungroup'
    const Icon = canGroup ? Group : Ungroup

    return (
      <ToolbarIconButton
        active={!canGroup && canUngroup}
        onClick={() => {
          if (canGroup) {
            editor.write.selection.group(context.target)
            return
          }

          if (canUngroup) {
            editor.write.selection.ungroup(context.target)
          }
        }}
        title={label}
        aria-label={label}
      >
        <Icon size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}
