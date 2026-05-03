import { ToolbarFillIcon, ToolbarIconButton } from '@shared/ui'
import {
  WHITEBOARD_FILL_COLOR_OPTIONS,
  WHITEBOARD_STICKY_FILL_OPTIONS,
  resolvePaletteColor
} from '@whiteboard/react/features/palette'
import { FillPanel } from '@whiteboard/react/features/selection/chrome/panels/FillPanel'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const fillItem: ToolbarItemSpec = {
  key: 'fill',
  panelKey: 'fill',
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
          fill={resolvePaletteColor(node.fill) ?? node.fill}
          opacity={node.fillOpacity}
        />
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
      <FillPanel
        fill={node.fill}
        fillOpacity={node.fillOpacity}
        options={node.kind === 'sticky'
          ? WHITEBOARD_STICKY_FILL_OPTIONS
          : WHITEBOARD_FILL_COLOR_OPTIONS}
        onFillChange={(value) => {
          editor.actions.document.node.style.fill(node.nodeIds, value)
        }}
        onFillOpacityChange={node.canEditFillOpacity
          ? (value) => {
              editor.actions.document.node.style.fillOpacity(node.nodeIds, value)
            }
          : undefined}
      />
    )
  }
}
