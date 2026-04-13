import { ToolbarButton } from '@shared/ui'
import { Shapes } from 'lucide-react'
import { SelectionFilterMenu } from '../../panels/SelectionFilterMenu'
import type { ToolbarItemSpec } from './types'

export const filterItem: ToolbarItemSpec = {
  key: 'filter',
  panelKey: 'filter',
  units: 3,
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarButton
      ref={(element) => {
        registerPanelButton('filter', element)
      }}
      active={activePanelKey === 'filter'}
      className="gap-1.5 text-[13px]"
      onClick={() => {
        togglePanel('filter')
      }}
      title="Filter selection"
      aria-label="Filter selection"
    >
      <Shapes size={16} strokeWidth={1.9} />
      <span className="truncate">{context.filter?.label ?? 'Objects'}</span>
    </ToolbarButton>
  ),
  renderPanel: ({
    editor,
    context,
    closePanel
  }) => (
    context.filter
      ? (
        <SelectionFilterMenu
          editor={editor}
          filter={context.filter}
          onClose={closePanel}
        />
        )
      : null
  )
}
