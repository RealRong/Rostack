import {
  drawTool,
  edgeTool,
  handTool,
  insertTool,
  selectTool,
  type EdgePresetKey,
  type Tool
} from '@whiteboard/editor'
import type {
  BrushStylePatch,
  DrawSlot
} from '@whiteboard/editor/draw'
import type { Dispatch, SetStateAction } from 'react'
import type { WhiteboardRuntime as Editor } from '#react/types/runtime'
import type {
  ToolPaletteMenuKey,
  ToolPaletteView
} from '../../types/toolbox'
import { TEXT_INSERT_PRESET } from './presets'

type MenuSetter = Dispatch<SetStateAction<ToolPaletteMenuKey | null>>
type DrawPanelSetter = Dispatch<SetStateAction<boolean>>

export type ToolPaletteController = {
  togglePrimaryTool: () => void
  toggleEdgeMenu: () => void
  toggleInsertMenu: (key: Extract<ToolPaletteMenuKey, 'sticky' | 'shape' | 'mindmap'>) => void
  activateTextTool: () => void
  toggleDrawMenu: () => void
  selectDrawKind: (value: ToolPaletteView['drawKind']) => void
  selectDrawSlot: (value: DrawSlot) => void
  patchDrawStyle: (patch: BrushStylePatch) => void
  selectEdgePreset: (value: EdgePresetKey) => void
  selectInsertPreset: (value: string) => void
}

const toggleMenu = (
  setOpenMenu: MenuSetter,
  key: ToolPaletteMenuKey
) => {
  setOpenMenu((current) => current === key ? null : key)
}

export const createToolPaletteController = ({
  editor,
  tool,
  palette,
  openMenu,
  closeMenu,
  setOpenMenu,
  setDrawPanelOpen
}: {
  editor: Editor
  tool: Tool
  palette: ToolPaletteView
  openMenu: ToolPaletteMenuKey | null
  closeMenu: () => void
  setOpenMenu: MenuSetter
  setDrawPanelOpen: DrawPanelSetter
}): ToolPaletteController => ({
  togglePrimaryTool: () => {
    closeMenu()
    if (tool.type === 'hand') {
      editor.commands.tool.set(selectTool())
      return
    }
    if (tool.type !== 'select') {
      editor.commands.tool.set(selectTool())
      return
    }

    editor.commands.tool.set(handTool())
  },
  toggleEdgeMenu: () => {
    if (tool.type !== 'edge') {
      editor.commands.tool.set(edgeTool(palette.edgePreset))
      setOpenMenu('edge')
      return
    }

    toggleMenu(setOpenMenu, 'edge')
  },
  toggleInsertMenu: (key) => {
    toggleMenu(setOpenMenu, key)
  },
  activateTextTool: () => {
    closeMenu()
    editor.commands.tool.set(insertTool(TEXT_INSERT_PRESET.key))
  },
  toggleDrawMenu: () => {
    if (tool.type !== 'draw') {
      editor.commands.tool.set(drawTool(palette.drawKind))
      setDrawPanelOpen(false)
      setOpenMenu('draw')
      return
    }

    if (openMenu === 'draw') {
      closeMenu()
      return
    }

    setDrawPanelOpen(false)
    setOpenMenu('draw')
  },
  selectDrawKind: (value) => {
    setDrawPanelOpen(false)
    editor.commands.tool.set(drawTool(value))
  },
  selectDrawSlot: (value) => {
    if (value === palette.drawBrush.slot) {
      setDrawPanelOpen((current) => !current)
      return
    }

    editor.commands.draw.slot(value)
    setDrawPanelOpen(true)
  },
  patchDrawStyle: (patch) => {
    editor.commands.draw.patch(patch)
  },
  selectEdgePreset: (value) => {
    closeMenu()
    editor.commands.tool.set(edgeTool(value))
  },
  selectInsertPreset: (value) => {
    closeMenu()
    editor.commands.tool.set(insertTool(value))
  }
})
