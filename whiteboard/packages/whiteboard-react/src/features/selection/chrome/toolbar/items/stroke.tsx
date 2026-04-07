import { Button } from '@ui'
import { BorderPanel } from '../../panels/BorderPanel'
import { ToolbarStrokeIcon } from '../primitives'
import type { ToolbarItemSpec } from './types'

export const strokeItem: ToolbarItemSpec = {
  key: 'stroke',
  panelKey: 'stroke',
  renderButton: ({
    context,
    activePanelKey,
    togglePanel,
    registerPanelButton
  }) => (
    <Button
      ref={(element) => {
        registerPanelButton('stroke', element)
      }}
      variant="ghost"
      pressed={activePanelKey === 'stroke'}
      className="h-9 w-9 rounded-xl p-0"
      onClick={() => {
        togglePanel('stroke')
      }}
      title="Border"
      aria-label="Border"
    >
      <ToolbarStrokeIcon
        stroke={context.stroke}
        strokeWidth={context.strokeWidth}
        strokeDash={context.canEditStrokeDash ? context.strokeDash : undefined}
        opacity={context.canEditStrokeOpacity
          ? context.strokeOpacity
          : context.opacity}
      />
    </Button>
  ),
  renderPanel: ({
    context,
    editor
  }) => (
    <BorderPanel
      stroke={context.stroke}
      strokeWidth={context.strokeWidth}
      opacity={context.canEditStrokeOpacity
        ? context.strokeOpacity
        : context.opacity}
      strokeDash={context.canEditStrokeDash ? context.strokeDash : undefined}
      showStyle={context.canEditStrokeDash}
      showOpacity={context.canEditStrokeOpacity || context.canEditNodeOpacity}
      onStrokeChange={(value) => {
        editor.commands.node.appearance.setStroke(context.nodeIds, value)
      }}
      onStrokeWidthChange={(value) => {
        editor.commands.node.appearance.setStrokeWidth(context.nodeIds, value)
      }}
      onOpacityChange={(value) => {
        if (context.canEditStrokeOpacity) {
          editor.commands.node.appearance.setStrokeOpacity(context.nodeIds, value)
          return
        }

        if (context.canEditNodeOpacity) {
          editor.commands.node.appearance.setOpacity(context.nodeIds, value)
        }
      }}
      onStrokeDashChange={context.canEditStrokeDash
        ? (value) => {
            editor.commands.node.appearance.setStrokeDash(context.nodeIds, value)
          }
        : undefined}
    />
  )
}
