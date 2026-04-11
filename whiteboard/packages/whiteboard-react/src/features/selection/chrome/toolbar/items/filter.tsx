import { Button } from '@ui'
import { Shapes } from 'lucide-react'
import { SelectionFilterMenu } from '../../panels/SelectionFilterMenu'
import { preventToolbarPointerDown } from '../primitives'
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
    <Button
      ref={(element) => {
        registerPanelButton('filter', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'filter'}
      className="h-9 min-w-0 gap-1.5 rounded-xl px-3 text-[13px] font-medium text-fg"
      onPointerDown={preventToolbarPointerDown}
      onClick={() => {
        togglePanel('filter')
      }}
      title="Filter selection"
      aria-label="Filter selection"
    >
      <Shapes size={16} strokeWidth={1.9} />
      <span className="truncate">{context.filter?.label ?? 'Objects'}</span>
    </Button>
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
