import type { BoardConfig as EngineBoardConfig } from '@whiteboard/core/config'
import type {
  CoreRegistries,
  Document,
  Point
} from '@whiteboard/core/types'
import { createEngine } from '@whiteboard/engine'
import {
  createEditor,
  type DrawState
} from '@whiteboard/editor'
import {
  WHITEBOARD_DRAW_DEFAULTS,
  WHITEBOARD_INSERT_CATALOG,
  WHITEBOARD_LINE_DEFAULT_COLOR,
  WHITEBOARD_FRAME_DEFAULT_TITLE,
  createWhiteboardFrameTemplate,
  readWhiteboardNodePaintDefaults
} from '@whiteboard/product'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'
import { createClipboardHostAdapter } from '@whiteboard/react/dom/host/clipboard'
import { createClipboardBridge } from '@whiteboard/react/runtime/bridge/clipboard'
import { createInsertBridge } from '@whiteboard/react/runtime/bridge/insert'
import { createPointerBridge } from '@whiteboard/react/runtime/bridge/pointer'
import { createTextSourceStore } from '@whiteboard/react/features/node/dom/textSourceStore'
import type { WhiteboardServicesContextValue } from '@whiteboard/react/runtime/hooks/useWhiteboard'
import { createLayoutBackend } from '@whiteboard/react/runtime/whiteboard/layout'

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
  const initialDrawState: DrawState = WHITEBOARD_DRAW_DEFAULTS
  const engine = createEngine({
    registries: coreRegistries,
    document,
    onDocumentChange,
    config: boardConfig
  })
  const textSources = createTextSourceStore()
  const editor = createEditor({
    engine,
    initialTool: resolvedConfig.initialTool,
    initialDrawState,
    initialViewport: resolvedConfig.viewport.initial,
    registry,
    services: {
      layout: createLayoutBackend({
        textSources
      }),
      defaults: {
        selection: {
          node: {
            readPaint: readWhiteboardNodePaintDefaults
          },
          edge: {
            color: WHITEBOARD_LINE_DEFAULT_COLOR,
            width: 2,
            dash: 'solid',
            textMode: 'horizontal'
          }
        },
        templates: {
          frame: ({
            bounds,
            padding
          }) => createWhiteboardFrameTemplate({
            title: WHITEBOARD_FRAME_DEFAULT_TITLE,
            size: {
              width: bounds.width + padding * 2,
              height: bounds.height + padding * 2
            }
          })
        }
      }
    }
  })
  const insert = createInsertBridge({
    editor,
    catalog: WHITEBOARD_INSERT_CATALOG
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

      const result = insert.template(tool.template, {
        at: input.world
      })
      if (!result) {
        return false
      }

      editor.actions.tool.select()
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
    textSources,
    pointer,
    clipboard,
    insert
  }
}
