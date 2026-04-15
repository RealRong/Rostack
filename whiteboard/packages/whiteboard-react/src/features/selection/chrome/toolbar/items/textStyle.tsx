import {
  Bold,
  Italic
} from 'lucide-react'
import { ToolbarIconButton } from '@shared/ui'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const boldItem: ToolbarItemSpec = {
  key: 'bold',
  renderButton: ({
    activeScope,
    editor
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }
    const active = (node.fontWeight ?? 400) >= 600

    return (
      <ToolbarIconButton
        active={active}
        title="Bold"
        onClick={() => {
          editor.actions.node.text.weight(node.nodeIds, active ? 400 : 700)
        }}
      >
        <Bold size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}

export const italicItem: ToolbarItemSpec = {
  key: 'italic',
  renderButton: ({
    activeScope,
    editor
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }
    const active = node.fontStyle === 'italic'

    return (
      <ToolbarIconButton
        active={active}
        title="Italic"
        onClick={() => {
          editor.actions.node.text.italic(node.nodeIds, !active)
        }}
      >
        <Italic size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}
