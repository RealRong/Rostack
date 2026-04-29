import type { HistoryPort } from '@shared/mutation'
import type { IntentResult } from '@whiteboard/engine'
import { engine as engineApi, normalizeDocument } from '@whiteboard/engine'
import { editor as editorApi } from '@whiteboard/editor'
import { createWhiteboardLayout } from '@whiteboard/core/layout'
import { compileNodeSpec } from '@whiteboard/editor/types/node'
import type { Editor } from '@whiteboard/editor'
import type { Engine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { createClipboardHostAdapter } from '@whiteboard/react/dom/host/clipboard'
import { createClipboardBridge } from '@whiteboard/react/runtime/bridge/clipboard'
import { createInsertBridge } from '@whiteboard/react/runtime/bridge/insert'
import { createPointerBridge } from '@whiteboard/react/runtime/bridge/pointer'
import { createTextSourceStore } from '@whiteboard/react/features/node/dom/textSourceStore'
import type { WhiteboardServicesContextValue } from '@whiteboard/react/runtime/hooks/useWhiteboard'
import { createLayoutBackend } from '@whiteboard/react/runtime/whiteboard/layout'
import { dismissBackgroundEditSelection } from '@whiteboard/react/runtime/whiteboard/pointerDown'
import type { WhiteboardSpec } from '@whiteboard/react/types/spec'

const editorState = new WeakMap<Editor, {
  spec: WhiteboardSpec
  engine: Engine
  textSources: ReturnType<typeof createTextSourceStore>
}>()

const clonePoint = (
  point: {
    x: number
    y: number
  }
) => ({
  x: point.x,
  y: point.y
})

const createPointState = () => {
  let current:
    | {
        x: number
        y: number
      }
    | undefined

  return {
    get: () => current,
    set: (point: {
      x: number
      y: number
    }) => {
      current = clonePoint(point)
    },
    clear: () => {
      current = undefined
    }
  }
}

export const createEditor = (input: {
  spec: WhiteboardSpec
  document: Parameters<typeof normalizeDocument>[0]
  history?: HistoryPort<IntentResult>
}): Editor => {
  const document = normalizeDocument(input.document)
  const textSources = createTextSourceStore()
  const layout = createWhiteboardLayout({
    nodes: input.spec.layout,
    backend: createLayoutBackend({
      textSources
    })
  })
  const engine = engineApi.create({
    document,
    layout
  })
  const editor = editorApi.create({
    engine,
    history: input.history ?? engine.history,
    initialTool: {
      type: 'select'
    },
    initialDrawState: product.draw.defaults,
    initialViewport: {
      center: {
        x: 0,
        y: 0
      },
      zoom: 1
    },
    nodes: input.spec.nodes,
    services: {
      layout,
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

  editorState.set(editor, {
    spec: input.spec,
    engine,
    textSources
  })

  return editor
}

export const createWhiteboardRuntime = (input: {
  spec: WhiteboardSpec
  editor: Editor
}): WhiteboardServicesContextValue => {
  const state = editorState.get(input.editor)
  if (!state) {
    throw new Error('createWhiteboardRuntime expects an editor created by createEditor.')
  }

  const textSources = state.textSources
  const nodes = compileNodeSpec(input.spec.nodes)
  const insert = createInsertBridge({
    editor: input.editor,
    catalog: product.insert.catalog.WHITEBOARD_INSERT_CATALOG
  })
  const point = createPointState()
  const pointer = createPointerBridge({
    editor: input.editor,
    point,
    onPointerDown: (inputState) => {
      dismissBackgroundEditSelection({
        editor: input.editor,
        input: inputState
      })

      const tool = input.editor.state.tool.get()
      if (
        tool.type !== 'insert'
        || inputState.pick.kind !== 'background'
        || inputState.editable
        || inputState.ignoreInput
        || inputState.ignoreSelection
      ) {
        return false
      }

      const result = insert.template(tool.template, {
        at: inputState.world
      })
      return Boolean(result)
    }
  })
  const clipboard = createClipboardBridge({
    editor: input.editor,
    adapter: createClipboardHostAdapter(),
    readDefaultOrigin: () => {
      const current = point.get()
      return clonePoint(current ?? input.editor.state.viewport.get().center)
    }
  })

  return {
    editor: input.editor,
    engine: state.engine,
    spec: input.spec,
    nodes,
    textSources,
    pointer,
    clipboard,
    insert
  }
}
