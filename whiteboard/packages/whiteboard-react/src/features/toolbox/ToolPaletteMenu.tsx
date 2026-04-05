import type {
  ToolPaletteMenuKey,
  ToolPaletteView
} from '../../types/toolbox'
import { DrawMenu } from './menus/DrawMenu'
import { EdgeMenu } from './menus/EdgeMenu'
import { MindmapMenu } from './menus/MindmapMenu'
import { ShapeMenu } from './menus/ShapeMenu'
import { StickyMenu } from './menus/StickyMenu'
import type { ToolPaletteController } from './controller'
import { TOOLBOX_PANEL_CLASSNAME } from './primitives'
import { cn } from '@ui'

export const ToolPaletteMenu = ({
  openMenu,
  palette,
  drawPanelOpen,
  controller
}: {
  openMenu: ToolPaletteMenuKey | null
  palette: ToolPaletteView
  drawPanelOpen: boolean
  controller: ToolPaletteController
}) => {
  if (!openMenu) {
    return null
  }

  if (openMenu === 'draw') {
    return (
      <DrawMenu
        kind={palette.drawKind}
        activeSlot={palette.drawBrush.slot}
        slots={palette.drawBrush.brush.slots}
        panelOpen={drawPanelOpen}
        onKind={controller.selectDrawKind}
        onSlot={controller.selectDrawSlot}
        onPatch={controller.patchDrawStyle}
      />
    )
  }

  return (
    <div
      className={cn(
        'max-h-[calc(100vh-32px)] min-w-[220px] max-w-[320px] overflow-auto rounded-[10px] p-2 text-sm',
        TOOLBOX_PANEL_CLASSNAME
      )}
    >
      {openMenu === 'edge' ? (
        <EdgeMenu
          value={palette.edgePreset}
          onChange={controller.selectEdgePreset}
        />
      ) : null}
      {openMenu === 'sticky' ? (
        <StickyMenu
          value={palette.stickyPreset}
          onChange={controller.selectInsertPreset}
        />
      ) : null}
      {openMenu === 'shape' ? (
        <ShapeMenu
          value={palette.shapePreset}
          onChange={controller.selectInsertPreset}
        />
      ) : null}
      {openMenu === 'mindmap' ? (
        <MindmapMenu
          value={palette.mindmapPreset}
          onChange={controller.selectInsertPreset}
        />
      ) : null}
    </div>
  )
}
