import { ToolbarFillIcon, ToolbarIconButton } from '@shared/ui'
import {
  FILL_COLOR_OPTIONS,
  STICKY_FILL_OPTIONS
} from '@whiteboard/react/features/selection/chrome/menus/options'
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
      options={context.kind === 'sticky'
        ? STICKY_FILL_OPTIONS
        : FILL_COLOR_OPTIONS}
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
