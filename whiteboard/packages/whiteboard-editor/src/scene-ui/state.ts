import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import { isHoverStateEqual } from '@whiteboard/editor/input/hover/store'
import {
  isDrawEqual,
  isEditSessionEqual,
  isInteractionStateEqual,
  isPreviewEqual,
  isSelectionEqual,
  isToolEqual,
  type EditorInteractionStateValue,
  type EditorStateDocument
} from '@whiteboard/editor/state/document'
import type { EditorStateRuntime } from '@whiteboard/editor/state/runtime'
import type { EditorStateStoreFacade } from '@whiteboard/editor/state/runtime'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'
import type { EditorState, ToolRead } from '@whiteboard/editor/scene-ui/types'

const isEdgeInteractionMode = (
  mode: EditorInteractionStateValue['mode']
): boolean => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

export type EditorStateStores = {
  tool: store.ReadStore<EditorStateDocument['state']['tool']>
  draw: store.ReadStore<EditorStateDocument['state']['draw']>
  selection: store.ReadStore<EditorStateDocument['state']['selection']>
  edit: store.ReadStore<EditorStateDocument['state']['edit']>
  interaction: store.ReadStore<EditorInteractionStateValue>
  preview: store.ReadStore<EditorStateDocument['preview']>
  viewport: store.ReadStore<ReturnType<EditorViewport['get']>>
}

export const createEditorStateStores = (input: {
  state: EditorStateStoreFacade
  viewport: EditorViewport
}): EditorStateStores => ({
  tool: store.value({
    get: () => input.state.read().state.tool,
    subscribe: input.state.subscribe,
    isEqual: isToolEqual
  }),
  draw: store.value({
    get: () => input.state.read().state.draw,
    subscribe: input.state.subscribe,
    isEqual: isDrawEqual
  }),
  selection: store.value({
    get: () => input.state.read().state.selection,
    subscribe: input.state.subscribe,
    isEqual: isSelectionEqual
  }),
  edit: store.value({
    get: () => input.state.read().state.edit,
    subscribe: input.state.subscribe,
    isEqual: isEditSessionEqual
  }),
  interaction: store.value({
    get: () => {
      const snapshot = input.state.read()
      return {
        mode: snapshot.state.interaction.mode,
        chrome: snapshot.state.interaction.chrome,
        space: snapshot.state.interaction.space,
        hover: snapshot.hover
      }
    },
    subscribe: input.state.subscribe,
    isEqual: (left, right) => (
      isInteractionStateEqual(left, right)
      && isHoverStateEqual(left.hover, right.hover)
    )
  }),
  preview: store.value({
    get: () => input.state.read().preview,
    subscribe: input.state.subscribe,
    isEqual: isPreviewEqual
  }),
  viewport: input.viewport.value
})

export const createEditorStateView = (input: {
  stores: EditorStateStores
  viewport: EditorViewport
}): EditorState => {
  const interaction = store.value(() => {
    const current = store.read(input.stores.interaction)
    const mode = current.mode

    return {
      busy: mode !== 'idle',
      chrome: current.chrome,
      transforming: mode === 'node-transform',
      drawing: mode === 'draw',
      panning: mode === 'viewport-pan',
      selecting: (
        mode === 'press'
        || mode === 'marquee'
        || mode === 'node-drag'
        || mode === 'mindmap-drag'
        || mode === 'node-transform'
      ),
      editingEdge: isEdgeInteractionMode(mode),
      space: current.space
    }
  }, {
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

  const zoom = store.value<number>(() => store.read(input.stores.viewport).zoom, {
    isEqual: (left, right) => left === right
  })
  const center = store.value(() => store.read(input.stores.viewport).center, {
    isEqual: geometryApi.equal.point
  })

  return {
    tool: {
      get: input.stores.tool.get,
      subscribe: input.stores.tool.subscribe,
      type: () => input.stores.tool.get().type,
      value: () => {
        const tool = input.stores.tool.get()
        return 'mode' in tool
          ? tool.mode
          : undefined
      },
      is: (type, value) => {
        const tool = input.stores.tool.get()
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
    } satisfies ToolRead,
    draw: input.stores.draw,
    edit: input.stores.edit,
    selection: input.stores.selection,
    interaction,
    preview: input.stores.preview,
    viewport: {
      get: input.stores.viewport.get,
      subscribe: input.stores.viewport.subscribe,
      pointer: input.viewport.pointer,
      worldToScreen: input.viewport.worldToScreen,
      worldRect: input.viewport.visibleWorldRect,
      screenPoint: input.viewport.screenPoint,
      size: input.viewport.size,
      value: input.stores.viewport,
      zoom,
      center
    }
  }
}
