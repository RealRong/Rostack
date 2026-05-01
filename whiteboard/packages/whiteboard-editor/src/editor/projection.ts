import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import { createEditorPolicyDerived } from '@whiteboard/editor/editor/derived/policy'
import { createEditorSceneDerived } from '@whiteboard/editor/editor/derived/scene'
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type {
  EditorSceneApi,
  EditorProjection,
  EditorProjectionStores,
  EditorState,
  ToolRead
} from '@whiteboard/editor/types/editor'

const readToolValue = (
  tool: ReturnType<EditorStateRuntime['stores']['tool']['store']['get']>
) => (
  'mode' in tool
    ? tool.mode
    : undefined
)

const isToolMatch = (
  tool: ReturnType<EditorStateRuntime['stores']['tool']['store']['get']>,
  type: ReturnType<EditorStateRuntime['stores']['tool']['store']['get']>['type'],
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

const createToolRead = (
  source: EditorStateRuntime['stores']['tool']['store']
): ToolRead => ({
  get: source.get,
  subscribe: source.subscribe,
  type: () => source.get().type,
  value: () => readToolValue(source.get()),
  is: (type, value) => isToolMatch(source.get(), type, value)
})

const createEditorStateView = (
  runtime: EditorStateRuntime
): EditorState => {
  const interaction = store.createDerivedStore({
    get: () => {
      const current = store.read(runtime.stores.interaction.store)
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
    get: () => store.read(runtime.viewport.read).zoom,
    isEqual: (left, right) => left === right
  })

  const center = store.createDerivedStore({
    get: () => store.read(runtime.viewport.read).center,
    isEqual: geometryApi.equal.point
  })

  return {
    tool: createToolRead(runtime.stores.tool.store),
    draw: runtime.stores.draw.store,
    edit: runtime.stores.edit.store,
    selection: runtime.stores.selection.store,
    interaction,
    viewport: {
      get: runtime.viewport.read.get,
      subscribe: runtime.viewport.read.subscribe,
      pointer: runtime.viewport.read.pointer,
      worldToScreen: runtime.viewport.read.worldToScreen,
      worldRect: runtime.viewport.read.worldRect,
      screenPoint: runtime.viewport.input.screenPoint,
      size: runtime.viewport.input.size,
      value: runtime.viewport.read,
      zoom,
      center
    }
  }
}

export const createEditorProjection = (input: {
  scene: import('@whiteboard/editor-scene').EditorScene
  runtime: EditorStateRuntime
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorProjection => {
  const state = createEditorStateView(input.runtime)
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

  const stores: EditorProjectionStores = {
    ...input.scene.stores,
    runtime: {
      editor: {
        tool: input.runtime.stores.tool.store,
        draw: input.runtime.stores.draw.store,
        selection: input.runtime.stores.selection.store,
        edit: input.runtime.stores.edit.store,
        interaction: input.runtime.stores.interaction.store,
        preview: input.runtime.stores.preview.store,
        viewport: input.runtime.stores.viewport.store
      }
    }
  }

  return {
    ...input.scene,
    stores,
    runtime: {
      ...input.scene.runtime,
      editor: {
        tool: input.runtime.stores.tool.store.get,
        draw: input.runtime.stores.draw.store.get,
        selection: input.runtime.stores.selection.store.get,
        edit: input.runtime.stores.edit.store.get,
        interaction: input.runtime.stores.interaction.store.get,
        preview: input.runtime.stores.preview.store.get,
        viewport: {
          get: input.runtime.viewport.read.get,
          pointer: input.runtime.viewport.read.pointer,
          worldToScreen: input.runtime.viewport.read.worldToScreen,
          worldRect: input.runtime.viewport.read.worldRect,
          screenPoint: input.runtime.viewport.input.screenPoint,
          size: input.runtime.viewport.input.size
        }
      }
    },
    derived: {
      scene: sceneDerived,
      editor: editorDerived
    }
  }
}

export const createEditorSceneApi = (input: {
  projection: EditorProjection
  runtime: EditorStateRuntime
  capture: () => import('@whiteboard/editor-scene').Capture
}): EditorSceneApi => {
  const editorState = createEditorStateView(input.runtime)

  return {
    document: input.projection.document,
    stores: {
      document: input.projection.stores.document,
      graph: input.projection.stores.graph,
      render: input.projection.stores.render,
      items: input.projection.stores.items
    },
    editor: {
      tool: editorState.tool,
      draw: input.projection.stores.runtime.editor.draw,
      selection: input.projection.stores.runtime.editor.selection,
      edit: input.projection.stores.runtime.editor.edit,
      interaction: editorState.interaction,
      preview: input.projection.stores.runtime.editor.preview,
      viewport: Object.assign(
        input.projection.stores.runtime.editor.viewport,
        {
          pointer: input.runtime.viewport.read.pointer,
          worldToScreen: input.runtime.viewport.read.worldToScreen,
          worldRect: input.runtime.viewport.read.worldRect,
          screenPoint: input.runtime.viewport.input.screenPoint,
          size: input.runtime.viewport.input.size
        }
      )
    },
    viewport: input.projection.viewport,
    nodes: input.projection.nodes,
    edges: input.projection.edges,
    mindmaps: input.projection.mindmaps,
    groups: input.projection.groups,
    hit: input.projection.hit,
    pick: input.projection.pick,
    snap: input.projection.snap,
    spatial: input.projection.spatial,
    selection: {
      members: input.projection.derived.scene.selection.members,
      summary: input.projection.derived.scene.selection.summary,
      affordance: input.projection.derived.scene.selection.affordance,
      view: input.projection.derived.scene.selection.view,
      node: input.projection.derived.editor.selection.node,
      edge: {
        ...input.projection.derived.editor.selection.edge,
        chrome: input.projection.derived.scene.selection.edge.chrome
      }
    },
    chrome: {
      selection: {
        marquee: input.projection.derived.scene.chrome.marquee,
        snapGuides: input.projection.derived.scene.chrome.snap,
        toolbar: input.projection.derived.editor.selection.toolbar,
        overlay: input.projection.derived.editor.selection.overlay
      },
      draw: {
        preview: input.projection.derived.scene.chrome.draw
      },
      edge: {
        guide: input.projection.derived.scene.chrome.edgeGuide
      }
    },
    mindmap: {
      chrome: {
        addChildTargets: input.projection.derived.scene.mindmap.chrome
      }
    },
    capture: input.capture,
    bounds: input.projection.bounds
  }
}
