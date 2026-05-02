import type {
  EditorScene,
  Capture
} from '@whiteboard/editor-scene'
import { createEditorChromeUi } from '@whiteboard/editor/scene-ui/chrome'
import { createEditorMindmapUi } from '@whiteboard/editor/scene-ui/mindmap'
import { createEditorSelectionUi } from '@whiteboard/editor/scene-ui/selection'
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/node'
import type { EditorSceneFacade } from '@whiteboard/editor/api/editor'
import type { EditorSceneUi, EditorState } from '@whiteboard/editor/scene-ui/types'

type EditorSceneUiProjection = EditorScene & {
  ui: Omit<EditorSceneUi, 'state'>
}

export const createEditorSceneUi = (input: {
  scene: EditorScene
  state: EditorState
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorSceneUiProjection => {
  const selection = createEditorSelectionUi({
    scene: input.scene,
    state: input.state,
    nodeType: input.nodeType,
    defaults: input.defaults
  })
  const chrome = createEditorChromeUi({
    scene: input.scene,
    state: input.state,
    selection,
    nodeType: input.nodeType,
    defaults: input.defaults
  })
  const mindmap = createEditorMindmapUi({
    scene: input.scene,
    state: input.state
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
  projection: EditorSceneUiProjection
  state: EditorState
  capture: () => Capture
}): EditorSceneFacade => {
  const {
    ui,
    ...scene
  } = input.projection

  return {
    ...scene,
    ui: {
      state: input.state,
      ...ui
    },
    capture: input.capture
  }
}
