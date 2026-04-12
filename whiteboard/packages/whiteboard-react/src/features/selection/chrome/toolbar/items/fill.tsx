import { Button } from '@ui'
import { FillPanel } from '../../panels/FillPanel'
import { preventToolbarPointerDown, ToolbarFillIcon } from '../primitives'
import type { ToolbarItemSpec } from './types'

export const fillItem: ToolbarItemSpec = {
  key: 'fill',
  panelKey: 'fill',
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <Button
      ref={(element) => {
        registerPanelButton('fill', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'fill'}
      className="h-9 w-9 rounded-xl p-0"
      onPointerDown={preventToolbarPointerDown}
      onClick={() => {
        togglePanel('fill')
      }}
      title="Fill"
      aria-label="Fill"
    >
      <ToolbarFillIcon
        fill={context.fill}
        opacity={context.fillOpacity}
      />
    </Button>
  ),
  renderPanel: ({
    context,
    editor
  }) => (
    <FillPanel
      fill={context.fill}
      fillOpacity={context.fillOpacity}
      onFillChange={(value) => {
        editor.actions.node.style.fill(context.nodeIds, value)
      }}
      onFillOpacityChange={context.canEditFillOpacity
        ? (value) => {
            editor.actions.node.style.fillOpacity(context.nodeIds, value)
          }
        : undefined}
    />
  )
}
