import { type Tool } from '@whiteboard/editor'
import type {
  DrawMode
} from '@whiteboard/editor'
import { product } from '@whiteboard/product'
import type { Dispatch, SetStateAction } from 'react'
import type { WhiteboardRuntime as Editor } from '@whiteboard/react/types/runtime'
import type {
  ToolPaletteBrushStylePatch,
  ToolPaletteDrawSlot,
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
  selectDrawSlot: (value: ToolPaletteDrawSlot) => void
  patchDrawStyle: (patch: ToolPaletteBrushStylePatch) => void
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
      editor.actions.session.tool.select()
      return
    }
    if (tool.type !== 'select') {
      editor.actions.session.tool.select()
      return
    }

    editor.actions.session.tool.hand()
  },
  toggleEdgeMenu: () => {
    if (tool.type !== 'edge') {
      const template = product.edge.presets.resolveWhiteboardEdgeTemplate(palette.edgePreset)
      if (!template) {
        return
      }
      editor.actions.session.tool.edge(template)
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
    editor.actions.session.tool.insert(product.insert.catalog.WHITEBOARD_TEXT_INSERT_PRESET.template)
  },
  toggleDrawMenu: () => {
    if (tool.type !== 'draw') {
      editor.actions.session.tool.draw(palette.drawMode)
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
    editor.actions.session.tool.draw(value)
  },
  selectDrawSlot: (value) => {
    if (value === palette.draw.slot) {
      setDrawPanelOpen((current) => !current)
      return
    }

    editor.actions.session.draw.slot(value)
    setDrawPanelOpen(true)
  },
  patchDrawStyle: (patch) => {
    editor.actions.session.draw.patch(patch)
  },
  selectEdgePreset: (value) => {
    const template = product.edge.presets.resolveWhiteboardEdgeTemplate(value)
    if (!template) {
      return
    }
    closeMenu()
    editor.actions.session.tool.edge(template)
  },
  selectInsertPreset: (value) => {
    const preset = product.insert.catalog.getWhiteboardInsertPreset(value)
    if (!preset) {
      return
    }
    closeMenu()
    editor.actions.session.tool.insert(preset.template)
  }
})
