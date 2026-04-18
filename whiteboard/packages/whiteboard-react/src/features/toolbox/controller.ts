import { type Tool } from '@whiteboard/editor'
import type {
  BrushStylePatch,
  DrawMode,
  DrawSlot
} from '@whiteboard/editor/draw'
import {
  WHITEBOARD_TEXT_INSERT_PRESET,
  getWhiteboardInsertPreset,
  resolveWhiteboardEdgeTemplate
} from '@whiteboard/product'
import type { Dispatch, SetStateAction } from 'react'
import type { WhiteboardRuntime as Editor } from '@whiteboard/react/types/runtime'
import type {
  ToolPaletteMenuKey,
  ToolPaletteView
} from '@whiteboard/react/types/toolbox'

type MenuSetter = Dispatch<SetStateAction<ToolPaletteMenuKey | null>>
type DrawPanelSetter = Dispatch<SetStateAction<boolean>>

export type ToolPaletteController = {
  togglePrimaryTool: () => void
  toggleEdgeMenu: () => void
  toggleInsertMenu: (key: Extract<ToolPaletteMenuKey, 'sticky' | 'shape' | 'mindmap'>) => void
  activateTextTool: () => void
  toggleDrawMenu: () => void
  selectDrawMode: (value: DrawMode) => void
  selectDrawSlot: (value: DrawSlot) => void
  patchDrawStyle: (patch: BrushStylePatch) => void
  selectEdgePreset: (value: string) => void
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
      editor.actions.tool.select()
      return
    }
    if (tool.type !== 'select') {
      editor.actions.tool.select()
      return
    }

    editor.actions.tool.hand()
  },
  toggleEdgeMenu: () => {
    if (tool.type !== 'edge') {
      const template = resolveWhiteboardEdgeTemplate(palette.edgePreset)
      if (!template) {
        return
      }
      editor.actions.tool.edge(template)
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
    editor.actions.tool.insert(WHITEBOARD_TEXT_INSERT_PRESET.template)
  },
  toggleDrawMenu: () => {
    if (tool.type !== 'draw') {
      editor.actions.tool.draw(palette.drawMode)
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
  selectDrawMode: (value) => {
    setDrawPanelOpen(false)
    editor.actions.tool.draw(value)
  },
  selectDrawSlot: (value) => {
    if (value === palette.drawBrush.slot) {
      setDrawPanelOpen((current) => !current)
      return
    }

    editor.actions.draw.slot(value)
    setDrawPanelOpen(true)
  },
  patchDrawStyle: (patch) => {
    editor.actions.draw.patch(patch)
  },
  selectEdgePreset: (value) => {
    const template = resolveWhiteboardEdgeTemplate(value)
    if (!template) {
      return
    }
    closeMenu()
    editor.actions.tool.edge(template)
  },
  selectInsertPreset: (value) => {
    const preset = getWhiteboardInsertPreset(value)
    if (!preset) {
      return
    }
    closeMenu()
    editor.actions.tool.insert(preset.template)
  }
})
