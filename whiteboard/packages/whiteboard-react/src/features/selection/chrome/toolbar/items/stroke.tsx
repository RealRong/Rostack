import { ToolbarIconButton, ToolbarStrokeIcon } from '@shared/ui'
import { resolvePaletteColor } from '@whiteboard/react/features/palette'
import { BorderPanel } from '@whiteboard/react/features/selection/chrome/panels/BorderPanel'
import type { ToolbarItemSpec } from '@whiteboard/react/features/selection/chrome/toolbar/items/types'

export const strokeItem: ToolbarItemSpec = {
  key: 'stroke',
  panelKey: 'stroke',
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
          registerPanelButton('stroke', element)
        }}
        active={activePanelKey === 'stroke'}
        onClick={() => {
          togglePanel('stroke')
        }}
        title="Border"
        aria-label="Border"
      >
        <ToolbarStrokeIcon
          stroke={resolvePaletteColor(node.stroke) ?? node.stroke}
          strokeWidth={node.strokeWidth}
          strokeDash={node.canEditStrokeDash ? node.strokeDash : undefined}
          opacity={node.canEditStrokeOpacity
            ? node.strokeOpacity
            : node.opacity}
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
      <BorderPanel
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        opacity={node.canEditStrokeOpacity
          ? node.strokeOpacity
          : node.opacity}
        strokeDash={node.canEditStrokeDash ? node.strokeDash : undefined}
        showStyle={node.canEditStrokeDash}
        showOpacity={node.canEditStrokeOpacity || node.canEditNodeOpacity}
        onStrokeChange={(value) => {
          editor.write.node.style.stroke(node.nodeIds, value)
        }}
        onStrokeWidthChange={(value) => {
          editor.write.node.style.strokeWidth(node.nodeIds, value)
        }}
        onOpacityChange={(value) => {
          if (node.canEditStrokeOpacity) {
            editor.write.node.style.strokeOpacity(node.nodeIds, value)
            return
          }

          if (node.canEditNodeOpacity) {
            editor.write.node.style.opacity(node.nodeIds, value)
          }
        }}
        onStrokeDashChange={node.canEditStrokeDash
          ? (value) => editor.write.node.style.strokeDash(node.nodeIds, value)
          : undefined}
      />
    )
  }
}
