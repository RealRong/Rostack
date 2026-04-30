import { createEditorPolicyDerived } from '@whiteboard/editor/editor/derived/policy'
import { createEditorSceneDerived } from '@whiteboard/editor/editor/derived/scene'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type {
  EditorDerived,
  EditorScene,
  EditorState
} from '@whiteboard/editor/types/editor'

export const createEditorDerived = (input: {
  scene: EditorScene
  state: EditorState
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorDerived => {
  const sceneDerived = createEditorSceneDerived({
    scene: input.scene,
    state: input.state
  })

  const editorDerived = createEditorPolicyDerived({
    scene: input.scene,
    state: input.state,
    sceneDerived,
    nodeType: input.nodeType,
    defaults: input.defaults
  })

  return {
    scene: sceneDerived,
    editor: editorDerived
  }
}
