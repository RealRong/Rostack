import { ToolbarIconButton, ToolbarTextColorIcon } from '@shared/ui'
import { resolvePaletteColor } from '@whiteboard/react/features/palette'
import { TextColorPanel } from '@whiteboard/react/features/selection/chrome/panels/TextColorPanel'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const textColorItem: ToolbarItemSpec = {
  key: 'text-color',
  panelKey: 'text-color',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }

    return (
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
        <ToolbarTextColorIcon color={resolvePaletteColor(node.textColor) ?? node.textColor} />
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }

    return (
      <TextColorPanel
        value={node.textColor}
        onChange={(value) => {
          editor.actions.document.node.style.textColor(node.nodeIds, value)
        }}
      />
    )
  }
}
