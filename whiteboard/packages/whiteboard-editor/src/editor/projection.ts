import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import type {
  EditorScene,
  Capture
} from '@whiteboard/editor-scene'
import { createEditorPolicyDerived } from '@whiteboard/editor/editor/derived/policy'
import { createEditorSceneDerived } from '@whiteboard/editor/editor/derived/scene'
import type { EditorProjection } from '@whiteboard/editor/editor/projection/types'
import { isHoverStateEqual } from '@whiteboard/editor/input/hover/store'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import {
  isDrawEqual,
  isEditSessionEqual,
  isInteractionStateEqual,
  isPreviewEqual,
  isSelectionEqual,
  isToolEqual,
  isViewportEqual,
  type EditorInteractionStateValue,
  type EditorStateDocument
} from '@whiteboard/editor/state-engine/document'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type {
  EditorSceneFacade,
  EditorState,
  ToolRead
} from '@whiteboard/editor/types/editor'

const readToolValue = (
  tool: EditorStateDocument['state']['tool']
) => (
  'mode' in tool
    ? tool.mode
    : undefined
)

const isToolMatch = (
  tool: EditorStateDocument['state']['tool'],
  type: EditorStateDocument['state']['tool']['type'],
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

const readInteractionValue = (
  snapshot: EditorStateDocument
): EditorInteractionStateValue => ({
  mode: snapshot.state.interaction.mode,
  chrome: snapshot.state.interaction.chrome,
  space: snapshot.state.interaction.space,
  hover: snapshot.overlay.hover
})

const readPreviewValue = (
  snapshot: EditorStateDocument
) => snapshot.overlay.preview

const createEditorStateStores = (
  runtime: EditorStateRuntime
) => ({
  tool: store.value({
    get: () => runtime.snapshot().state.tool,
    subscribe: runtime.commits.subscribe,
    isEqual: isToolEqual
  }),
  draw: store.value({
    get: () => runtime.snapshot().state.draw,
    subscribe: runtime.commits.subscribe,
    isEqual: isDrawEqual
  }),
  selection: store.value({
    get: () => runtime.snapshot().state.selection,
    subscribe: runtime.commits.subscribe,
    isEqual: isSelectionEqual
  }),
  edit: store.value({
    get: () => runtime.snapshot().state.edit,
    subscribe: runtime.commits.subscribe,
    isEqual: isEditSessionEqual
  }),
  interaction: store.value({
    get: () => readInteractionValue(runtime.snapshot()),
    subscribe: runtime.commits.subscribe,
    isEqual: (left, right) => (
      isInteractionStateEqual(left, right)
      && isHoverStateEqual(left.hover, right.hover)
    )
  }),
  preview: store.value({
    get: () => readPreviewValue(runtime.snapshot()),
    subscribe: runtime.commits.subscribe,
    isEqual: isPreviewEqual
  }),
  viewport: store.value({
    get: () => runtime.snapshot().state.viewport,
    subscribe: runtime.commits.subscribe,
    isEqual: isViewportEqual
  })
})

const createToolRead = (
  source: Pick<ReturnType<typeof createEditorStateStores>['tool'], 'get' | 'subscribe'>
): ToolRead => ({
  get: source.get,
  subscribe: source.subscribe,
  type: () => source.get().type,
  value: () => readToolValue(source.get()),
  is: (type, value) => isToolMatch(source.get(), type, value)
})

type EditorStateStoreReaders = {
  tool: store.ReadStore<EditorStateDocument['state']['tool']>
  draw: store.ReadStore<EditorStateDocument['state']['draw']>
  selection: store.ReadStore<EditorStateDocument['state']['selection']>
  edit: store.ReadStore<EditorStateDocument['state']['edit']>
  interaction: store.ReadStore<EditorInteractionStateValue>
  preview: store.ReadStore<ReturnType<typeof readPreviewValue>>
  viewport: store.ReadStore<EditorStateDocument['state']['viewport']>
}

const createEditorStateView = (input: {
  stores: EditorStateStoreReaders
  runtime: EditorStateRuntime
}): EditorState => {
  const interaction = store.createDerivedStore({
    get: () => {
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
    get: () => store.read(input.stores.viewport).zoom,
    isEqual: (left, right) => left === right
  })

  const center = store.createDerivedStore({
    get: () => store.read(input.stores.viewport).center,
    isEqual: geometryApi.equal.point
  })

  return {
    tool: createToolRead(input.stores.tool),
    draw: input.stores.draw,
    edit: input.stores.edit,
    selection: input.stores.selection,
    interaction,
    preview: input.stores.preview,
    viewport: {
      get: input.stores.viewport.get,
      subscribe: input.stores.viewport.subscribe,
      pointer: input.runtime.viewport.read.pointer,
      worldToScreen: input.runtime.viewport.read.worldToScreen,
      worldRect: input.runtime.viewport.read.worldRect,
      screenPoint: input.runtime.viewport.input.screenPoint,
      size: input.runtime.viewport.input.size,
      value: input.stores.viewport,
      zoom,
      center
    }
  }
}

export const createEditorProjection = (input: {
  scene: EditorScene
  runtime: EditorStateRuntime
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorProjection => {
  const stateStores = createEditorStateStores(input.runtime)
  const state = createEditorStateView({
    stores: stateStores,
    runtime: input.runtime
  })
  const sceneDerived = createEditorSceneDerived({
    scene: input.scene,
    state
  })
  const editorDerived = createEditorPolicyDerived({
    scene: input.scene,
    state,
    sceneDerived,
    nodeType: input.nodeType,
    defaults: input.defaults
  })

  return {
    ...input.scene,
    derived: {
      scene: sceneDerived,
      editor: editorDerived
    }
  }
}

export const createEditorSceneFacade = (input: {
  projection: EditorProjection
  runtime: EditorStateRuntime
  capture: () => Capture
}): EditorSceneFacade => {
  const stateStores = createEditorStateStores(input.runtime)
  const editorState = createEditorStateView({
    stores: stateStores,
    runtime: input.runtime
  })
  const {
    derived,
    ...scene
  } = input.projection

  return {
    ...scene,
    ui: {
      state: editorState,
      selection: {
        members: derived.scene.selection.members,
        summary: derived.scene.selection.summary,
        affordance: derived.scene.selection.affordance,
        view: derived.scene.selection.view,
        node: derived.editor.selection.node,
        edge: {
          ...derived.editor.selection.edge,
          chrome: derived.scene.selection.edge.chrome
        }
      },
      chrome: {
        selection: {
          marquee: derived.scene.chrome.marquee,
          snapGuides: derived.scene.chrome.snap,
          toolbar: derived.editor.selection.toolbar,
          overlay: derived.editor.selection.overlay
        },
        draw: {
          preview: derived.scene.chrome.draw
        },
        edge: {
          guide: derived.scene.chrome.edgeGuide
        }
      },
      mindmap: {
        addChildTargets: derived.scene.mindmap.chrome
      }
    },
    capture: input.capture
  }
}
