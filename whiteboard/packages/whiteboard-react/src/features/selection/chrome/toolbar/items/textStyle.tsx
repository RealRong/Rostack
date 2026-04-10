import {
  Bold,
  Italic
} from 'lucide-react'
import { ToolbarIconButton } from '../primitives'
import type { ToolbarItemSpec } from './types'
import { toNodeStylePatch } from '#react/features/node/update'

export const boldItem: ToolbarItemSpec = {
  key: 'bold',
  renderButton: ({
    context,
    editor
  }) => {
    const active = (context.fontWeight ?? 400) >= 600
    const node = context.primaryNode ?? context.nodes[0]

    return (
      <ToolbarIconButton
        active={active}
        title="Bold"
        onClick={() => {
          if (!node) {
            return
          }

          editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
            fontWeight: active ? 400 : 700
          }))
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
    const node = context.primaryNode ?? context.nodes[0]

    return (
      <ToolbarIconButton
        active={active}
        title="Italic"
        onClick={() => {
          if (!node) {
            return
          }

          editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
            fontStyle: !active ? 'italic' : 'normal'
          }))
        }}
      >
        <Italic size={18} strokeWidth={1.9} />
      </ToolbarIconButton>
    )
  }
}
