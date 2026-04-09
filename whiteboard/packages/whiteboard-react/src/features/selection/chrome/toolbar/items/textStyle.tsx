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
          editor.document.nodes.patch(context.nodeIds, {
            style: {
              fontWeight: active ? 400 : 700
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
          editor.document.nodes.patch(context.nodeIds, {
            style: {
              fontStyle: !active ? 'italic' : 'normal'
            }
          })
        }}
      >
        <Italic size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}
