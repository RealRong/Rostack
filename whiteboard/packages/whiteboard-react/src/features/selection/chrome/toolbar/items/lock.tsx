import { Lock } from 'lucide-react'
import { ToolbarIconButton } from '../primitives'
import type { ToolbarItemSpec } from './types'

export const lockItem: ToolbarItemSpec = {
  key: 'lock',
  renderButton: ({
    context,
    editor
  }) => (
    <ToolbarIconButton
      active={context.locked === 'all'}
      title={context.locked === 'all' ? 'Unlock' : 'Lock'}
      onClick={() => {
        editor.commands.node.lock.set(context.nodeIds, context.locked !== 'all')
      }}
    >
      <Lock size={18} strokeWidth={1.9} />
    </ToolbarIconButton>
  )
}
