import {
  Bold,
  Italic
} from 'lucide-react'
import { ToolbarIconButton } from '../primitives'
import type { ToolbarItemSpec } from './types'

export const boldItem: ToolbarItemSpec = {
  key: 'bold',
  renderButton: ({
    context,
    editor
  }) => {
    const active = (context.fontWeight ?? 400) >= 600

    return (
      <ToolbarIconButton
        active={active}
        title="Bold"
        onClick={() => {
          editor.actions.document.nodes.text.set({
            nodeIds: context.nodeIds,
            patch: {
              weight: active ? 400 : 700
            }
          })
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
    context,
    editor
  }) => {
    const active = context.fontStyle === 'italic'

    return (
      <ToolbarIconButton
        active={active}
        title="Italic"
        onClick={() => {
          editor.actions.document.nodes.text.set({
            nodeIds: context.nodeIds,
            patch: {
              italic: !active
            }
          })
        }}
      >
        <Italic size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}
