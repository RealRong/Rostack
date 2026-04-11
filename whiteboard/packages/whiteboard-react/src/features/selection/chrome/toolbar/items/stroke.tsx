import { Button } from '@ui'
import { BorderPanel } from '../../panels/BorderPanel'
import { preventToolbarPointerDown, ToolbarStrokeIcon } from '../primitives'
import type { ToolbarItemSpec } from './types'
import { toNodeFieldUpdate, toNodeStylePatch } from '#react/features/node/update'

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
      onPointerDown={preventToolbarPointerDown}
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
  }) => {
    const node = context.primaryNode ?? context.nodes[0]

    return (
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
        if (!node) {
          return
        }

        editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
          stroke: value
        }))
      }}
      onStrokeWidthChange={(value) => {
        if (!node) {
          return
        }

        editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
          strokeWidth: value
        }))
      }}
      onOpacityChange={(value) => {
        if (context.canEditStrokeOpacity) {
          if (!node) {
            return
          }

          editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
            strokeOpacity: value
          }))
          return
        }

        if (context.canEditNodeOpacity) {
          if (!node) {
            return
          }

          editor.actions.node.patch(context.nodeIds, toNodeStylePatch(node, {
            opacity: value
          }))
        }
      }}
      onStrokeDashChange={context.canEditStrokeDash
        ? (value) => {
            if (!node) {
              return
            }

            editor.actions.node.patch(context.nodeIds, toNodeFieldUpdate({
              scope: 'style',
              path: 'strokeDash'
            }, value))
          }
        : undefined}
      />
    )
  }
}
