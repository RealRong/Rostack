import type { BoardConfig as EngineBoardConfig } from '@whiteboard/core/config'
import type {
  CoreRegistries,
  Document,
  Point
} from '@whiteboard/core/types'
import { createEngine } from '@whiteboard/engine'
import { createEditor } from '@whiteboard/editor'
import { INSERT_PRESET_CATALOG } from '@whiteboard/react/features/toolbox/presets'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'
import { createClipboardHostAdapter } from '@whiteboard/react/dom/host/clipboard'
import { createClipboardBridge } from '@whiteboard/react/runtime/bridge/clipboard'
import { createInsertBridge } from '@whiteboard/react/runtime/bridge/insert'
import { createPointerBridge } from '@whiteboard/react/runtime/bridge/pointer'
import type { WhiteboardServicesContextValue } from '@whiteboard/react/runtime/hooks/useWhiteboard'
import { createTextLayoutMeasurer } from '@whiteboard/react/runtime/whiteboard/textLayout'

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
  let editor: WhiteboardServicesContextValue['editor'] | null = null
  const measureText = createTextLayoutMeasurer(() => editor)
  editor = createEditor({
    engine,
    initialTool: resolvedConfig.initialTool,
    initialViewport: resolvedConfig.viewport.initial,
    registry,
    measureText
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
      const tool = editor.store.tool.get()
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

      editor.actions.tool.select()
      editor.actions.selection.replace({
        nodeIds: [result.nodeId]
      })
      if (result.edit) {
        editor.actions.edit.startNode(result.edit.nodeId, result.edit.field)
      }
      return true
    }
  })
  const clipboard = createClipboardBridge({
    editor,
    adapter: createClipboardHostAdapter(),
    readDefaultOrigin: () => {
      const current = point.get()
      return clonePoint(current ?? editor.store.viewport.get().center)
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
