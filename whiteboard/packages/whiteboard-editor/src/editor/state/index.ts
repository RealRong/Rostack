import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type {
  EditorInteractionState,
  EditorState,
  ToolRead
} from '@whiteboard/editor/types/editor'

const readToolValue = (
  tool: ReturnType<EditorSession['state']['tool']['get']>
) => (
  'mode' in tool
    ? tool.mode
    : undefined
)

const isToolMatch = (
  tool: ReturnType<EditorSession['state']['tool']['get']>,
  type: ReturnType<EditorSession['state']['tool']['get']>['type'],
  value?: string
) => {
  if (tool.type !== type) {
    return false
  }

  if (value === undefined) {
    return true
  }

  return tool.type === 'draw'
    ? tool.mode === value
    : false
}

export const createToolRead = (
  source: EditorSession['state']['tool']
): ToolRead => ({
  get: source.get,
  subscribe: source.subscribe,
  type: () => source.get().type,
  value: () => readToolValue(source.get()),
  is: (type, value) => isToolMatch(source.get(), type, value)
})

export const createEditorState = (
  session: Pick<EditorSession, 'state' | 'interaction' | 'viewport'>
): EditorState => {
  const interaction = store.createDerivedStore<EditorInteractionState>({
    get: () => {
      const mode = store.read(session.interaction.read.mode)
      const busy = store.read(session.interaction.read.busy)
      const chrome = store.read(session.interaction.read.chrome)

      return {
        busy,
        chrome,
        transforming: mode === 'node-transform',
        drawing: mode === 'draw',
        panning: mode === 'viewport-pan',
        selecting:
          mode === 'press'
          || mode === 'marquee'
          || mode === 'node-drag'
          || mode === 'mindmap-drag'
          || mode === 'node-transform',
        editingEdge: isEdgeInteractionMode(mode),
        space: store.read(session.interaction.read.space)
      }
    },
    isEqual: (left, right) => (
      left.busy === right.busy
      && left.chrome === right.chrome
      && left.transforming === right.transforming
      && left.drawing === right.drawing
      && left.panning === right.panning
      && left.selecting === right.selecting
      && left.editingEdge === right.editingEdge
      && left.space === right.space
    )
  })

  const zoom = store.createDerivedStore<number>({
    get: () => session.viewport.read.get().zoom,
    isEqual: (left, right) => left === right
  })

  const center = store.createDerivedStore({
    get: () => session.viewport.read.get().center,
    isEqual: geometryApi.equal.point
  })

  return {
    tool: createToolRead(session.state.tool),
    draw: session.state.draw,
    edit: session.state.edit,
    selection: session.state.selection,
    interaction,
    viewport: {
      get: session.viewport.read.get,
      subscribe: session.viewport.read.subscribe,
      pointer: session.viewport.read.pointer,
      worldToScreen: session.viewport.read.worldToScreen,
      worldRect: session.viewport.read.worldRect,
      screenPoint: session.viewport.input.screenPoint,
      size: session.viewport.input.size,
      value: session.viewport.read,
      zoom,
      center
    }
  }
}
