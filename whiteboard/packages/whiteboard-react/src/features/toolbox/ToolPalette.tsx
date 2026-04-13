import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { FloatingLayer } from '@rostack/ui'
import { useStoreValue } from '@shared/react'
import {
  useEditor,
  useTool
} from '#react/runtime/hooks'
import { WhiteboardPopover } from '#react/runtime/overlay'
import { ToolPaletteButtons } from './ToolPaletteButtons'
import { ToolPaletteMenu } from './ToolPaletteMenu'
import { createToolPaletteController } from './controller'
import {
  DEFAULT_TOOL_PALETTE_MEMORY,
  rememberToolPaletteTool,
  readToolPaletteView
} from './model'
import type {
  ToolPaletteMemory,
  ToolPaletteMenuKey
} from '../../types/toolbox'

export const ToolPalette = () => {
  const editor = useEditor()
  const tool = useTool()
  const paletteMemoryRef = useRef<ToolPaletteMemory>(DEFAULT_TOOL_PALETTE_MEMORY)
  const buttonRefByKey = useRef<Partial<Record<ToolPaletteMenuKey, HTMLButtonElement | null>>>({})
  const [openMenu, setOpenMenu] = useState<ToolPaletteMenuKey | null>(null)
  const [drawPanelOpen, setDrawPanelOpen] = useState(false)
  const drawState = useStoreValue(editor.store.draw)
  const palette = readToolPaletteView({
    tool,
    drawState,
    memory: paletteMemoryRef.current
  })

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
  const menuContentClassName = openMenu === 'draw'
    ? '!bg-transparent !shadow-none !p-0 min-w-0'
    : '!bg-transparent !shadow-none !p-0 min-w-[220px] max-w-[320px] max-h-[calc(100vh-32px)] overflow-auto'

  return (
    <FloatingLayer className="z-[var(--wb-z-toolbar)]">
      <ToolPaletteButtons
        tool={tool}
        palette={palette}
        controller={controller}
        buttonRefByKey={buttonRefByKey}
      />
      {openMenu && activeMenuButton ? (
        <WhiteboardPopover
          open
          anchor={activeMenuButton}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeMenu()
            }
          }}
          placement="right-start"
          offset={10}
          contentClassName={menuContentClassName}
        >
          <ToolPaletteMenu
            openMenu={openMenu}
            palette={palette}
            drawPanelOpen={drawPanelOpen}
            controller={controller}
          />
        </WhiteboardPopover>
      ) : null}
    </FloatingLayer>
  )
}
