import { ToolbarIconButton } from '@shared/ui'
import { MoreHorizontal } from 'lucide-react'
import { SelectionActionMenu } from '../../panels/SelectionActionMenu'
import type { ToolbarItemSpec } from './types'

export const moreItem: ToolbarItemSpec = {
  key: 'more',
  panelKey: 'more',
  renderButton: ({
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarIconButton
      ref={(element) => {
        registerPanelButton('more', element)
      }}
      active={activePanelKey === 'more'}
      onClick={() => {
        togglePanel('more')
      }}
      title="More"
      aria-label="More"
    >
      <MoreHorizontal size={18} strokeWidth={1.9} />
    </ToolbarIconButton>
  ),
  renderPanel: ({
    closePanel
  }) => (
    <SelectionActionMenu
      onClose={closePanel}
    />
  )
}
