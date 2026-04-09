import { Button } from '@ui'
import { ShapeGlyph } from '#react/features/node'
import { ShapePickerPanel } from '../../panels/ShapePickerPanel'
import type { ToolbarItemSpec } from './types'

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
    <Button
      ref={(element) => {
        registerPanelButton('shape-kind', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'shape-kind'}
      className="h-9 rounded-xl px-2.5"
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
    </Button>
  ),
  renderPanel: ({
    context,
    editor
  }) => (
    <ShapePickerPanel
      value={context.shapeKindValue ?? context.shapeKind}
      onChange={(value) => {
        editor.document.nodes.patch(context.nodeIds, {
          data: {
            kind: value
          }
        })
      }}
    />
  )
}
