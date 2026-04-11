import { Button } from '@ui'
import { MoreHorizontal } from 'lucide-react'
import { SelectionActionMenu } from '../../panels/SelectionActionMenu'
import { preventToolbarPointerDown } from '../primitives'
import type { ToolbarItemSpec } from './types'

export const moreItem: ToolbarItemSpec = {
  key: 'more',
  panelKey: 'more',
  renderButton: ({
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <Button
      ref={(element) => {
        registerPanelButton('more', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'more'}
      className="h-9 w-9 rounded-xl p-0"
      onPointerDown={preventToolbarPointerDown}
      onClick={() => {
        togglePanel('more')
      }}
      title="More"
      aria-label="More"
    >
      <MoreHorizontal size={18} strokeWidth={1.9} />
    </Button>
  ),
  renderPanel: ({
    closePanel
  }) => (
    <SelectionActionMenu
      onClose={closePanel}
    />
  )
}
