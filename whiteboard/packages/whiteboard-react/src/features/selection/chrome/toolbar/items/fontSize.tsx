import { FontSizePanel } from '@whiteboard/react/features/selection/chrome/panels/FontSizePanel'
import { FontSizeControl } from '@whiteboard/react/features/selection/chrome/toolbar/items/shared/FontSizeControl'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const fontSizeItem: ToolbarItemSpec = {
  key: 'font-size',
  panelKey: 'font-size',
  units: 2,
  renderButton: ({
    activeScope,
    editor,
    togglePanel,
    registerPanelButton
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }

    return (
      <FontSizeControl
        value={node.fontSize}
        registerAnchor={(element) => {
          registerPanelButton('font-size', element)
        }}
        onTogglePanel={() => {
          togglePanel('font-size')
        }}
        onCommit={(value) => {
          editor.actions.node.text.size({
            nodeIds: node.nodeIds,
            value
          })
        }}
      />
    )
  },
  renderPanel: ({
    activeScope,
    editor,
    closePanel
  }) => {
    const node = activeScope.node
    if (!node) {
      return null
    }

    return (
      <FontSizePanel
        value={node.fontSize}
        onChange={(value) => {
          closePanel()
          editor.actions.node.text.size({
            nodeIds: node.nodeIds,
            value
          })
        }}
      />
    )
  }
}
