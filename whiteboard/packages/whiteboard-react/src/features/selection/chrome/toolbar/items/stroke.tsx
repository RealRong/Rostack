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
        editor.actions.document.nodes.style.set(context.nodeIds, {
          stroke: value
        })
      }}
      onStrokeWidthChange={(value) => {
        editor.actions.document.nodes.style.set(context.nodeIds, {
          strokeWidth: value
        })
      }}
      onOpacityChange={(value) => {
        if (context.canEditStrokeOpacity) {
          editor.actions.document.nodes.style.set(context.nodeIds, {
            strokeOpacity: value
          })
          return
        }

        if (context.canEditNodeOpacity) {
          editor.actions.document.nodes.style.set(context.nodeIds, {
            opacity: value
          })
        }
      }}
      onStrokeDashChange={context.canEditStrokeDash
        ? (value) => {
            editor.actions.document.nodes.style.set(context.nodeIds, {
              strokeDash: value
            })
          }
        : undefined}
    />
  )
}
