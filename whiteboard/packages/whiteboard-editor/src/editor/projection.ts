import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import { createEditorPolicyDerived } from '@whiteboard/editor/editor/derived/policy'
import { createEditorSceneDerived } from '@whiteboard/editor/editor/derived/scene'
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
  EditorSceneApi,
  EditorProjection,
  EditorProjectionStores,
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

const createProjectionStateStores = (
  runtime: EditorStateRuntime
) => {
  const initialSnapshot = runtime.snapshot()
  const tool = store.createValueStore(initialSnapshot.state.tool, {
    isEqual: isToolEqual
  })
  const draw = store.createValueStore(initialSnapshot.state.draw, {
    isEqual: isDrawEqual
  })
  const selection = store.createValueStore(initialSnapshot.state.selection, {
    isEqual: isSelectionEqual
  })
  const edit = store.createValueStore(initialSnapshot.state.edit, {
    isEqual: isEditSessionEqual
  })
  const interaction = store.createValueStore(readInteractionValue(initialSnapshot), {
    isEqual: (left, right) => (
      isInteractionStateEqual(left, right)
      && isHoverStateEqual(left.hover, right.hover)
    )
  })
  const preview = store.createValueStore(readPreviewValue(initialSnapshot), {
    isEqual: isPreviewEqual
  })
  const viewport = store.createValueStore(initialSnapshot.state.viewport, {
    isEqual: isViewportEqual
  })

  const sync = () => {
    const snapshot = runtime.snapshot()
    tool.set(snapshot.state.tool)
    draw.set(snapshot.state.draw)
    selection.set(snapshot.state.selection)
    edit.set(snapshot.state.edit)
    interaction.set(readInteractionValue(snapshot))
    preview.set(readPreviewValue(snapshot))
    viewport.set(snapshot.state.viewport)
  }

  const unsubscribe = runtime.commits.subscribe(() => {
    sync()
  })

  return {
    tool,
    draw,
    selection,
    edit,
    interaction,
    preview,
    viewport,
    dispose: unsubscribe
  }
}

const createToolRead = (
  source: Pick<ReturnType<typeof createProjectionStateStores>['tool'], 'get' | 'subscribe'>
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
  scene: import('@whiteboard/editor-scene').EditorScene
  runtime: EditorStateRuntime
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorProjection => {
  const runtimeStores = createProjectionStateStores(input.runtime)
  const state = createEditorStateView({
    stores: runtimeStores,
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

  const stores: EditorProjectionStores = {
    ...input.scene.stores,
    runtime: {
      editor: {
        tool: runtimeStores.tool,
        draw: runtimeStores.draw,
        selection: runtimeStores.selection,
        edit: runtimeStores.edit,
        interaction: runtimeStores.interaction,
        preview: runtimeStores.preview,
        viewport: runtimeStores.viewport
      }
    }
  }

  return {
    ...input.scene,
    stores,
    runtime: {
      ...input.scene.runtime,
      editor: {
        tool: runtimeStores.tool.get,
        hover: () => input.scene.runtime.editor.hover(),
        interaction: () => input.scene.runtime.editor.interaction(),
        draw: runtimeStores.draw.get,
        selection: runtimeStores.selection.get,
        edit: runtimeStores.edit.get,
        interactionState: runtimeStores.interaction.get,
        preview: runtimeStores.preview.get,
        viewport: {
          get: runtimeStores.viewport.get,
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
  const editorState = createEditorStateView({
    stores: {
      tool: input.projection.stores.runtime.editor.tool,
      draw: input.projection.stores.runtime.editor.draw,
      selection: input.projection.stores.runtime.editor.selection,
      edit: input.projection.stores.runtime.editor.edit,
      interaction: input.projection.stores.runtime.editor.interaction,
      preview: input.projection.stores.runtime.editor.preview,
      viewport: input.projection.stores.runtime.editor.viewport
    },
    runtime: input.runtime
  })

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
