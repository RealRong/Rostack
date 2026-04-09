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
        editor.document.nodes.patch(context.nodeIds, {
          style: {
            stroke: value
          }
        })
      }}
      onStrokeWidthChange={(value) => {
        editor.document.nodes.patch(context.nodeIds, {
          style: {
            strokeWidth: value
          }
        })
      }}
      onOpacityChange={(value) => {
        if (context.canEditStrokeOpacity) {
          editor.document.nodes.patch(context.nodeIds, {
            style: {
              strokeOpacity: value
            }
          })
          return
        }

        if (context.canEditNodeOpacity) {
          editor.document.nodes.patch(context.nodeIds, {
            style: {
              opacity: value
            }
          })
        }
      }}
      onStrokeDashChange={context.canEditStrokeDash
        ? (value) => {
            editor.document.nodes.patch(context.nodeIds, {
              style: {
                strokeDash: value
              }
            })
          }
        : undefined}
    />
  )
}
