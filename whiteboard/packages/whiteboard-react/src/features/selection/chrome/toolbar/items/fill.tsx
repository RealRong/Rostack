import { Button } from '@ui'
import { FillPanel } from '../../panels/FillPanel'
import { ToolbarFillIcon } from '../primitives'
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
        editor.actions.document.nodes.style.set(context.nodeIds, {
          fill: value
        })
      }}
      onFillOpacityChange={context.canEditFillOpacity
        ? (value) => {
            editor.actions.document.nodes.style.set(context.nodeIds, {
              fillOpacity: value
            })
          }
        : undefined}
    />
  )
}
