import type {
  EditorScene,
  Capture
} from '@whiteboard/editor-scene'
import type { EditorProjection } from '@whiteboard/editor/editor/projection/types'
import { createEditorChromeUi } from '@whiteboard/editor/editor/ui/chrome'
import { createEditorMindmapUi } from '@whiteboard/editor/editor/ui/mindmap'
import { createEditorSelectionUi } from '@whiteboard/editor/editor/ui/selection'
import type { EditorState } from '@whiteboard/editor/types/editor'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorSceneFacade } from '@whiteboard/editor/types/editor'

export const createEditorProjection = (input: {
  scene: EditorScene
  state: EditorState
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorProjection => {
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
  projection: EditorProjection
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
