import { Shapes } from 'lucide-react'
import { ToolbarButton } from '@shared/ui'
import { SelectionScopeMenu } from '@whiteboard/react/features/selection/chrome/panels/SelectionScopeMenu'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const scopeItem: ToolbarItemSpec = {
  key: 'scope',
  panelKey: 'scope',
  units: 3,
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarButton
      ref={(element) => {
        registerPanelButton('scope', element)
      }}
      active={activePanelKey === 'scope'}
      className="gap-1.5 text-[13px]"
      onClick={() => {
        togglePanel('scope')
      }}
      title="Selection scope"
      aria-label="Selection scope"
    >
      <Shapes size={16} strokeWidth={1.9} />
      <span className="truncate">{activeScope.label}</span>
    </ToolbarButton>
  ),
  renderPanel: ({
    context,
    activeScope,
    closePanel,
    setActiveScope
  }) => (
    <SelectionScopeMenu
      scopes={context.scopes}
      activeScopeKey={activeScope.key}
      onSelect={setActiveScope}
      onClose={closePanel}
    />
  )
}
