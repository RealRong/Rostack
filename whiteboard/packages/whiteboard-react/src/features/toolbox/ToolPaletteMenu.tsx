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

type ToolPaletteMenuPlacement = {
  left: number
  top: number
  width: number
}

export const ToolPaletteMenu = ({
  openMenu,
  menuStyle,
  palette,
  drawPanelOpen,
  controller
}: {
  openMenu: ToolPaletteMenuKey | null
  menuStyle?: ToolPaletteMenuPlacement
  palette: ToolPaletteView
  drawPanelOpen: boolean
  controller: ToolPaletteController
}) => {
  if (!openMenu || !menuStyle) {
    return null
  }

  if (openMenu === 'draw') {
    return (
      <div
        className="wb-left-toolbar-draw-floating"
        style={{
          left: menuStyle.left,
          top: menuStyle.top,
          transform: 'translateY(-50%)'
        }}
        data-selection-ignore
        data-input-ignore
      >
        <DrawMenu
          kind={palette.drawKind}
          activeSlot={palette.drawBrush.slot}
          slots={palette.drawBrush.brush.slots}
          panelOpen={drawPanelOpen}
          onKind={controller.selectDrawKind}
          onSlot={controller.selectDrawSlot}
          onPatch={controller.patchDrawStyle}
        />
      </div>
    )
  }

  return (
    <div
      className="wb-left-toolbar-menu"
      style={{
        left: menuStyle.left,
        top: menuStyle.top,
        width: menuStyle.width,
        transform: 'translateY(-50%)'
      }}
      data-selection-ignore
      data-input-ignore
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
