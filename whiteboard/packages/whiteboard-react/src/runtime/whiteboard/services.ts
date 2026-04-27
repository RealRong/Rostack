import type { BoardConfig as EngineBoardConfig } from '@whiteboard/core/config'
import type {
  CoreRegistries,
  Document,
  Point
} from '@whiteboard/core/types'
import {
  store
} from '@shared/core'
import {
  type HistoryPort
} from '@shared/mutation'
import { engine as engineApi } from '@whiteboard/engine'
import { editor as editorApi, type DrawState } from '@whiteboard/editor'
import type { IntentResult } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'
import { createClipboardHostAdapter } from '@whiteboard/react/dom/host/clipboard'
import { createClipboardBridge } from '@whiteboard/react/runtime/bridge/clipboard'
import { createInsertBridge } from '@whiteboard/react/runtime/bridge/insert'
import { createPointerBridge } from '@whiteboard/react/runtime/bridge/pointer'
import { createTextSourceStore } from '@whiteboard/react/features/node/dom/textSourceStore'
import type { WhiteboardServicesContextValue } from '@whiteboard/react/runtime/hooks/useWhiteboard'
import { createLayoutBackend } from '@whiteboard/react/runtime/whiteboard/layout'
import { dismissBackgroundEditSelection } from '@whiteboard/react/runtime/whiteboard/pointerDown'

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

export type WhiteboardRuntimeServices = WhiteboardServicesContextValue & {
  history: HistoryPort<IntentResult>
  setHistorySource(next: HistoryPort<IntentResult>): void
  resetHistorySource(): void
}

const createSwitchableHistoryPort = (
  initial: HistoryPort<IntentResult>
) => {
  const state = store.createValueStore(initial.get())
  let current = initial
  let unsubscribe = current.subscribe(() => {
    state.set(current.get())
  })

  const bind = (
    next: HistoryPort<IntentResult>
  ) => {
    unsubscribe()
    current = next
    state.set(current.get())
    unsubscribe = current.subscribe(() => {
      state.set(current.get())
    })
  }

  return {
    port: {
      get: state.get,
      subscribe: state.subscribe,
      undo: () => current.undo(),
      redo: () => current.redo(),
      clear: () => current.clear(),
      withPolicy: (policy) => current.withPolicy(policy)
    } satisfies HistoryPort<IntentResult>,
    set: bind,
    reset: () => {
      bind(initial)
    }
  }
}

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
}): WhiteboardRuntimeServices => {
  const initialDrawState: DrawState = product.draw.defaults
  const engine = engineApi.create({
    registries: coreRegistries,
    document,
    onDocumentChange,
    config: boardConfig
  })
  const history = createSwitchableHistoryPort(engine.history)
  const textSources = createTextSourceStore()
  const editor = editorApi.create({
    engine,
    history: history.port,
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
            readPaint: product.node.defaults.readWhiteboardNodePaintDefaults
          },
          edge: {
            color: product.palette.defaults.lineColor,
            width: 2,
            dash: 'solid',
            textMode: 'horizontal'
          }
        },
        templates: {
          frame: ({
            bounds,
            padding
          }) => product.node.templates.createWhiteboardFrameTemplate({
            title: product.node.templates.WHITEBOARD_FRAME_DEFAULT_TITLE,
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
    catalog: product.insert.catalog.WHITEBOARD_INSERT_CATALOG
  })
  const point = createPointState()
  const pointer = createPointerBridge({
    editor,
    point,
    onPointerDown: input => {
      dismissBackgroundEditSelection({
        editor,
        input
      })

      const tool = editor.session.tool.get()
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

      return true
    }
  })
  const clipboard = createClipboardBridge({
    editor,
    adapter: createClipboardHostAdapter(),
    readDefaultOrigin: () => {
      const current = point.get()
      return clonePoint(current ?? editor.session.viewport.get().center)
    }
  })

  return {
    editor,
    engine,
    history: history.port,
    setHistorySource: history.set,
    resetHistorySource: history.reset,
    registry,
    textSources,
    pointer,
    clipboard,
    insert
  }
}
