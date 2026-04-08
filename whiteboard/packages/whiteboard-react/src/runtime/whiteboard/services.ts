import type { BoardConfig as EngineBoardConfig } from '@whiteboard/core/config'
import type {
  CoreRegistries,
  Document,
  Point
} from '@whiteboard/core/types'
import { createEngine } from '@whiteboard/engine'
import { createEditor, selectTool } from '@whiteboard/editor'
import { DEFAULT_DRAW_PREFERENCES } from '../../features/toolbox/drawPreferences'
import { INSERT_PRESET_CATALOG } from '../../features/toolbox/presets'
import type { ResolvedConfig } from '../../types/common/config'
import { createClipboardHostAdapter } from '../../dom/host/clipboard'
import { createClipboardBridge } from '../bridge/clipboard'
import { createInsertBridge } from '../bridge/insert'
import { createPointerBridge } from '../bridge/pointer'
import type { WhiteboardServicesContextValue } from '../hooks/useWhiteboard'

const clonePoint = (
  point: Point
) => ({
  x: point.x,
  y: point.y
})

const createPointState = () => {
  let current: Point | undefined

  return {
    get: () => current,
    set: (point: Point) => {
      current = clonePoint(point)
    },
    clear: () => {
      current = undefined
    }
  }
}

export const isMirroredDocumentFromEngine = (
  outbound: Document,
  inbound: Document
) => (
  outbound.id === inbound.id
  && outbound.name === inbound.name
  && outbound.nodes === inbound.nodes
  && outbound.edges === inbound.edges
  && outbound.background === inbound.background
  && outbound.meta === inbound.meta
)

export const createWhiteboardServices = ({
  document,
  onDocumentChange,
  coreRegistries,
  registry,
  resolvedConfig,
  boardConfig
}: {
  document: Document
  onDocumentChange: (document: Document) => void
  coreRegistries?: CoreRegistries
  registry: WhiteboardServicesContextValue['registry']
  resolvedConfig: ResolvedConfig
  boardConfig: EngineBoardConfig
}): WhiteboardServicesContextValue => {
  const engine = createEngine({
    registries: coreRegistries,
    document,
    onDocumentChange,
    config: boardConfig
  })
  const editor = createEditor({
    engine,
    initialTool: resolvedConfig.initialTool,
    initialDrawPreferences: DEFAULT_DRAW_PREFERENCES,
    initialViewport: resolvedConfig.viewport.initial,
    registry
  })
  const insert = createInsertBridge({
    editor,
    catalog: INSERT_PRESET_CATALOG
  })
  const point = createPointState()
  const pointer = createPointerBridge({
    editor,
    point,
    onPointerDown: input => {
      const tool = editor.state.tool.get()
      if (
        tool.type !== 'insert'
        || input.pick.kind !== 'background'
        || input.editable
        || input.ignoreInput
        || input.ignoreSelection
      ) {
        return false
      }

      const result = insert.preset(tool.preset, {
        at: input.world
      })
      if (!result) {
        return false
      }

      editor.commands.tool.set(selectTool())
      return true
    }
  })
  const clipboard = createClipboardBridge({
    editor,
    adapter: createClipboardHostAdapter(),
    readDefaultOrigin: () => {
      const current = point.get()
      return clonePoint(current ?? editor.state.viewport.get().center)
    }
  })

  return {
    editor,
    engine,
    registry,
    pointer,
    clipboard,
    insert
  }
}
