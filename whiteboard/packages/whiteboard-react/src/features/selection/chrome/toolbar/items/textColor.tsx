import { Button } from '@ui'
import { TextColorPanel } from '../../panels/TextColorPanel'
import { preventToolbarPointerDown, ToolbarTextColorIcon } from '../primitives'
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
    <Button
      ref={(element) => {
        registerPanelButton('text-color', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'text-color'}
      className="h-9 w-9 rounded-xl p-0"
      onPointerDown={preventToolbarPointerDown}
      onClick={() => {
        togglePanel('text-color')
      }}
      title="Text color"
      aria-label="Text color"
    >
      <ToolbarTextColorIcon color={context.textColor} />
    </Button>
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
