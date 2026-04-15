import { Type } from 'lucide-react'
import { ToolbarButton } from '@shared/ui'
import { EdgeTextPanel } from '@whiteboard/react/features/selection/chrome/panels/EdgePanels'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const edgeTextItem: ToolbarItemSpec = {
  key: 'edge-text',
  panelKey: 'edge-text',
  units: 2,
  renderButton: ({
    activeScope,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => {
    const edge = activeScope.edge
    if (!edge?.single) {
      return null
    }

    return (
      <ToolbarButton
        ref={(element) => {
          registerPanelButton('edge-text', element)
        }}
        active={activePanelKey === 'edge-text'}
        className="gap-1.5 text-[13px]"
        onClick={() => {
          togglePanel('edge-text')
        }}
        title="Text"
        aria-label="Text"
      >
        <Type size={16} strokeWidth={1.9} />
        <span className="truncate">{edge.textMode ?? 'horizontal'}</span>
      </ToolbarButton>
    )
  },
  renderPanel: ({
    activeScope,
    editor
  }) => {
    const edge = activeScope.edge
    if (!edge?.single || !edge.primaryEdgeId) {
      return null
    }

    const primaryEdgeId = edge.primaryEdgeId

    return (
      <EdgeTextPanel
        value={edge.textMode}
        canAddLabel={true}
        onChange={(value) => {
          editor.actions.edge.textMode.set(edge.edgeIds, value)
        }}
        onAddLabel={() => {
          editor.actions.edge.label.add(primaryEdgeId)
        }}
      />
    )
  }
}
