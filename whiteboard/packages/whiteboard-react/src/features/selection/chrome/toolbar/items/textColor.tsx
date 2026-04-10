import { Button } from '@ui'
import { toNodeStylePatch } from '@whiteboard/core/node'
import { TextColorPanel } from '../../panels/TextColorPanel'
import { ToolbarTextColorIcon } from '../primitives'
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
  }) => {
    const node = context.primaryNode ?? context.nodes[0]

    return (
      <TextColorPanel
      value={context.textColor}
      onChange={(value) => {
        if (!node) {
          return
        }

        editor.document.nodes.patch(context.nodeIds, toNodeStylePatch(node, {
          color: value
        }))
      }}
      />
    )
  }
}
