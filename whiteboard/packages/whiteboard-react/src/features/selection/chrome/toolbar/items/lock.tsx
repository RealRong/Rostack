import { ToolbarIconButton } from '@shared/ui'
import { Lock } from 'lucide-react'
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
        editor.actions.node.lock.set(context.nodeIds, context.locked !== 'all')
      }}
    >
      <Lock size={18} strokeWidth={1.9} />
    </ToolbarIconButton>
  )
}
