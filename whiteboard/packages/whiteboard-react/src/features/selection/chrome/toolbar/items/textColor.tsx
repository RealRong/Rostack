import { ToolbarIconButton, ToolbarTextColorIcon } from '@rostack/ui'
import { TextColorPanel } from '../../panels/TextColorPanel'
import type { ToolbarItemSpec } from './types'

export const textColorItem: ToolbarItemSpec = {
  key: 'text-color',
  panelKey: 'text-color',
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarIconButton
      ref={(element) => {
        registerPanelButton('text-color', element)
      }}
      active={activePanelKey === 'text-color'}
      onClick={() => {
        togglePanel('text-color')
      }}
      title="Text color"
      aria-label="Text color"
    >
      <ToolbarTextColorIcon color={context.textColor} />
    </ToolbarIconButton>
  ),
  renderPanel: ({
    context,
    editor
  }) => (
    <TextColorPanel
      value={context.textColor}
      onChange={(value) => {
        editor.actions.node.style.textColor(context.nodeIds, value)
      }}
    />
  )
}
