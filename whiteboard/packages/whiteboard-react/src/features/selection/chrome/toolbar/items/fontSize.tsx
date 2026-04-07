import { FontSizePanel } from '../../panels/FontSizePanel'
import { FontSizeControl } from './shared/FontSizeControl'
import type { ToolbarItemSpec } from './types'

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
        editor.commands.node.text.setSize({
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
        editor.commands.node.text.setSize({
          nodeIds: context.nodeIds,
          value
        })
      }}
    />
  )
}
