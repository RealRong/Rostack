import { ToolbarIconButton } from '@shared/ui'
import {
  EdgeMarkerIcon,
  EdgeMarkersPanel
} from '@whiteboard/react/features/selection/chrome/panels/EdgePanels'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const edgeMarkersItem: ToolbarItemSpec = {
  key: 'edge-markers',
  panelKey: 'edge-markers',
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
          registerPanelButton('edge-markers', element)
        }}
        active={activePanelKey === 'edge-markers'}
        onClick={() => {
          togglePanel('edge-markers')
        }}
        title="Markers"
        aria-label="Markers"
      >
        <EdgeMarkerIcon marker={edge.end} side="end" />
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

    const primaryEdgeId = edge.primaryEdgeId

    return (
      <EdgeMarkersPanel
        start={edge.start}
        end={edge.end}
        onStartChange={(value) => {
          editor.actions.edge.style.start(edge.edgeIds, value)
        }}
        onEndChange={(value) => {
          editor.actions.edge.style.end(edge.edgeIds, value)
        }}
        onSwap={edge.single && primaryEdgeId
          ? () => {
              editor.actions.edge.style.start(
                [primaryEdgeId],
                edge.end ?? 'none'
              )
              editor.actions.edge.style.end(
                [primaryEdgeId],
                edge.start ?? 'none'
              )
            }
          : undefined}
      />
    )
  }
}
