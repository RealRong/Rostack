import { PickerPanelSurface } from '@shared/ui'
import type {
  ToolPaletteMenuKey,
  ToolPaletteView
} from '@whiteboard/react/types/toolbox'
import { DrawMenu } from '@whiteboard/react/features/toolbox/menus/DrawMenu'
import { EdgeMenu } from '@whiteboard/react/features/toolbox/menus/EdgeMenu'
import { MindmapMenu } from '@whiteboard/react/features/toolbox/menus/MindmapMenu'
import { ShapeMenu } from '@whiteboard/react/features/toolbox/menus/ShapeMenu'
import { StickyMenu } from '@whiteboard/react/features/toolbox/menus/StickyMenu'
import type { ToolPaletteController } from '@whiteboard/react/features/toolbox/controller'

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
        mode={palette.drawMode}
        activeSlot={palette.drawBrush.slot}
        slots={palette.drawBrush.state.slots}
        panelOpen={drawPanelOpen}
        onMode={controller.selectDrawMode}
        onSlot={controller.selectDrawSlot}
        onPatch={controller.patchDrawStyle}
      />
    )
  }

  return (
    <PickerPanelSurface className="max-h-[calc(100vh-32px)] min-w-[220px] max-w-[320px] overflow-auto">
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
    </PickerPanelSurface>
  )
}
