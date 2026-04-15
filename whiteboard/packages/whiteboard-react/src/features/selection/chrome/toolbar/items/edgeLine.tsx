import { ToolbarIconButton } from '@shared/ui'
import { EdgeLineIcon, EdgeLinePanel } from '@whiteboard/react/features/selection/chrome/panels/EdgePanels'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const edgeLineItem: ToolbarItemSpec = {
  key: 'edge-line',
  panelKey: 'edge-line',
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <ToolbarIconButton
        ref={(element) => {
          registerPanelButton('edge-line', element)
        }}
        active={activePanelKey === 'edge-line'}
        onClick={() => {
          togglePanel('edge-line')
        }}
        title="Line"
        aria-label="Line"
      >
        <EdgeLineIcon
          type={edge.type}
          dash={edge.dash}
          color={edge.color}
        />
      </ToolbarIconButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge) {
      return null
    }

    return (
      <EdgeLinePanel
        type={edge.type}
        dash={edge.dash}
        width={edge.width}
        color={edge.color}
        onTypeChange={(value) => {
          editor.actions.edge.type.set(edge.edgeIds, value)
        }}
        onDashChange={(value) => {
          editor.actions.edge.style.dash(edge.edgeIds, value)
        }}
        onWidthChange={(value) => {
          editor.actions.edge.style.width(edge.edgeIds, value)
        }}
        onColorChange={(value) => {
          editor.actions.edge.style.color(edge.edgeIds, value)
        }}
      />
    )
  }
}
