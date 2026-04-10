import { FontSizePanel } from '../../panels/FontSizePanel'
import { FontSizeControl } from './shared/FontSizeControl'
import type { ToolbarItemSpec } from './types'
import { toNodeFieldUpdate } from '#react/features/node/update'

export const fontSizeItem: ToolbarItemSpec = {
  key: 'font-size',
  panelKey: 'font-size',
  units: 2,
  renderButton: ({
    context,
    editor,
    togglePanel,
    registerPanelButton
  }) => {
    const node = context.primaryNode ?? context.nodes[0]

    return (
      <FontSizeControl
      value={context.fontSize}
      registerAnchor={(element) => {
        registerPanelButton('font-size', element)
      }}
      onTogglePanel={() => {
        togglePanel('font-size')
      }}
      onCommit={(value) => {
        if (!node) {
          return
        }

        editor.actions.node.patch(context.nodeIds, toNodeFieldUpdate({
          scope: 'style',
          path: 'fontSize'
        }, value))
      }}
      />
    )
  },
  renderPanel: ({
    context,
    editor,
    closePanel
  }) => {
    const node = context.primaryNode ?? context.nodes[0]

    return (
      <FontSizePanel
      value={context.fontSize}
      onChange={(value) => {
        closePanel()
        if (!node) {
          return
        }

        editor.actions.node.patch(context.nodeIds, toNodeFieldUpdate({
          scope: 'style',
          path: 'fontSize'
        }, value))
      }}
      />
    )
  }
}
