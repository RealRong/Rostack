import type {
  EditorScene,
  Capture
} from '@whiteboard/editor-scene'
import type { EditorProjection } from '@whiteboard/editor/editor/projection/types'
import { createEditorChromeUi } from '@whiteboard/editor/editor/ui/chrome'
import { createEditorMindmapUi } from '@whiteboard/editor/editor/ui/mindmap'
import { createEditorSelectionUi } from '@whiteboard/editor/editor/ui/selection'
import {
  createEditorStateStores,
  createEditorStateView
} from '@whiteboard/editor/editor/ui/state'
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorSceneFacade } from '@whiteboard/editor/types/editor'

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
  const selection = createEditorSelectionUi({
    scene: input.scene,
    state,
    nodeType: input.nodeType,
    defaults: input.defaults
  })
  const chrome = createEditorChromeUi({
    scene: input.scene,
    state,
    selection,
    nodeType: input.nodeType,
    defaults: input.defaults
  })
  const mindmap = createEditorMindmapUi({
    scene: input.scene,
    state
  })

  return {
    ...input.scene,
    ui: {
      selection,
      chrome,
      mindmap
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
    ui,
    ...scene
  } = input.projection

  return {
    ...scene,
    ui: {
      state: editorState,
      ...ui
    },
    capture: input.capture
  }
}
