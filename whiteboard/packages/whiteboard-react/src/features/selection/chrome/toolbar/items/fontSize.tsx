import { FontSizePanel } from '#whiteboard-react/features/selection/chrome/panels/FontSizePanel'
import { FontSizeControl } from '#whiteboard-react/features/selection/chrome/toolbar/items/shared/FontSizeControl'
import type { ToolbarItemSpec } from '#whiteboard-react/features/selection/chrome/toolbar/items/types'

export const fontSizeItem: ToolbarItemSpec = {
  key: 'font-size',
  panelKey: 'font-size',
  units: 2,
  renderButton: ({
    context,
    editor,
    togglePanel,
    registerPanelButton
  }) => (
    <FontSizeControl
      value={context.fontSize}
      registerAnchor={(element) => {
        registerPanelButton('font-size', element)
      }}
      onTogglePanel={() => {
        togglePanel('font-size')
      }}
      onCommit={(value) => {
        editor.actions.node.text.size({
          nodeIds: context.nodeIds,
          value
        })
      }}
    />
  ),
  renderPanel: ({
    context,
    editor,
    closePanel
  }) => (
    <FontSizePanel
      value={context.fontSize}
      onChange={(value) => {
        closePanel()
        editor.actions.node.text.size({
          nodeIds: context.nodeIds,
          value
        })
      }}
    />
  )
}
