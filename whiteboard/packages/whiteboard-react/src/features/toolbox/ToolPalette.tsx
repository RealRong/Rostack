import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { FloatingLayer } from '@shared/ui'
import { useStoreValue } from '@shared/react'
import {
  useEditor,
  useTool
} from '@whiteboard/react/runtime/hooks'
import { WhiteboardPopover } from '@whiteboard/react/runtime/overlay'
import { ToolPaletteButtons } from '@whiteboard/react/features/toolbox/ToolPaletteButtons'
import { ToolPaletteMenu } from '@whiteboard/react/features/toolbox/ToolPaletteMenu'
import { createToolPaletteController } from '@whiteboard/react/features/toolbox/controller'
import {
  DEFAULT_TOOL_PALETTE_MEMORY,
  rememberToolPaletteTool,
  readToolPaletteView
} from '@whiteboard/react/features/toolbox/model'
import type {
  ToolPaletteMemory,
  ToolPaletteMenuKey
} from '@whiteboard/react/types/toolbox'
import { Point } from '@shared/dom'

export const ToolPalette = memo(() => {
  const editor = useEditor()
  const tool = useTool()
  const paletteMemoryRef = useRef<ToolPaletteMemory>(DEFAULT_TOOL_PALETTE_MEMORY)
  const buttonRefByKey = useRef<Partial<Record<ToolPaletteMenuKey, HTMLButtonElement | null>>>({})
  const [openMenu, setOpenMenu] = useState<ToolPaletteMenuKey | null>(null)
  const [drawPanelOpen, setDrawPanelOpen] = useState(false)
  const drawState = useStoreValue(editor.scene.editor.draw)
  const palette = useMemo(() => readToolPaletteView({
    tool,
    drawState,
    memory: paletteMemoryRef.current
  }), [drawState, tool])

  useEffect(() => {
    paletteMemoryRef.current = rememberToolPaletteTool(
      paletteMemoryRef.current,
      tool
    )
  }, [tool])

  const closeMenu = useCallback(() => {
    setOpenMenu(null)
    setDrawPanelOpen(false)
  }, [])
  const controller = useMemo(() => createToolPaletteController({
    editor,
    tool,
    palette,
    openMenu,
    closeMenu,
    setOpenMenu,
    setDrawPanelOpen
  }), [closeMenu, editor, openMenu, palette, tool])
  const activeMenuButton = openMenu
    ? buttonRefByKey.current[openMenu]
    : null

  const [pos, setPos] = useState<Point>()

  useEffect(() => {
    if (openMenu && activeMenuButton) {
      const rect = activeMenuButton.getBoundingClientRect()
      setPos({ x: rect.right + 10, y: rect.top + rect.height / 2 })
      return
    } else {
      setPos(undefined)
    }
  }, [openMenu])
  return (
    <FloatingLayer className="z-[var(--wb-z-toolbar)]">
      <ToolPaletteButtons
        tool={tool}
        palette={palette}
        controller={controller}
        buttonRefByKey={buttonRefByKey}
      />
      {openMenu && pos ? (
        <div
          style={{
            position: 'absolute',
            top: pos.y,
            left: pos.x
          }}
          className='-translate-y-1/2'
        >
          <ToolPaletteMenu
            openMenu={openMenu}
            palette={palette}
            drawPanelOpen={drawPanelOpen}
            controller={controller}
          />
        </div>
      ) : null}
    </FloatingLayer>
  )
})

ToolPalette.displayName = 'ToolPalette'
