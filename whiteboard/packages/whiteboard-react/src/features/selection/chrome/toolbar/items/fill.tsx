import { ToolbarFillIcon, ToolbarIconButton } from '@shared/ui'
import { FillPanel } from '@whiteboard/react/features/selection/chrome/panels/FillPanel'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const fillItem: ToolbarItemSpec = {
  key: 'fill',
  panelKey: 'fill',
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarIconButton
      ref={(element) => {
        registerPanelButton('fill', element)
      }}
      active={activePanelKey === 'fill'}
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
    </ToolbarIconButton>
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
