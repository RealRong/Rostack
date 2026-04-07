import { Button } from '@ui'
import { MoreHorizontal } from 'lucide-react'
import type { SelectionMoreMenuSectionView } from '../../../../node/selection'
import { ShapeMoreMenu } from '../../panels/ShapeMoreMenu'
import type { ToolbarItemSpec } from './types'

const filterStateSections = (
  sections: readonly SelectionMoreMenuSectionView[]
) => sections.filter((section) => section.key !== 'state')

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
    context,
    closePanel
  }) => (
    <ShapeMoreMenu
      sections={filterStateSections(context.menuSections)}
      onClose={closePanel}
    />
  )
}
