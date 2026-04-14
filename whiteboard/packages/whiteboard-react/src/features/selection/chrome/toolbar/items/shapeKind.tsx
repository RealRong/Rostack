import { ToolbarButton } from '@shared/ui'
import { ShapeGlyph } from '@whiteboard/react/features/node'
import { ShapePickerPanel } from '@whiteboard/react/features/selection/chrome/panels/ShapePickerPanel'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const shapeKindItem: ToolbarItemSpec = {
  key: 'shape-kind',
  panelKey: 'shape-kind',
  units: 2,
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <ToolbarButton
      ref={(element) => {
        registerPanelButton('shape-kind', element)
      }}
      active={activePanelKey === 'shape-kind'}
      className="px-2.5"
      onClick={() => {
        togglePanel('shape-kind')
      }}
      title="Shape"
      aria-label="Shape"
    >
      <ShapeGlyph
        kind={context.shapeKind ?? 'rect'}
        width={24}
        height={18}
        fill="var(--ui-surface)"
        stroke="currentColor"
        strokeWidth={4}
      />
    </ToolbarButton>
  ),
  renderPanel: ({
    context,
    editor
  }) => (
    <ShapePickerPanel
      value={context.shapeKindValue ?? context.shapeKind}
      onChange={(value) => {
        editor.actions.node.shape.set(context.nodeIds, value)
      }}
    />
  )
}
