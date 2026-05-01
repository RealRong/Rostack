import { store } from '@shared/core'
import type { EditorScene } from '@whiteboard/editor-scene'
import type {
  EditorSceneUiMindmap,
  EditorState,
  MindmapChrome
} from '@whiteboard/editor/types/editor'

export const createEditorMindmapUi = (input: {
  scene: EditorScene
  state: EditorState
}): EditorSceneUiMindmap => ({
  addChildTargets: store.createKeyedDerivedStore({
    get: (mindmapId) => {
      if (!input.scene.mindmaps.get(mindmapId)) {
        return undefined
      }

        return {
          addChildTargets: input.scene.mindmaps.addChildTargets({
            mindmapId,
            selection: store.read(input.state.selection),
            edit: store.read(input.state.edit)
          })
        }
      },
    isEqual: (left: MindmapChrome | undefined, right: MindmapChrome | undefined) => (
      left === right
      || (
        left !== undefined
        && right !== undefined
        && left.addChildTargets.length === right.addChildTargets.length
        && left.addChildTargets.every((entry, index) => (
          entry.targetNodeId === right.addChildTargets[index]?.targetNodeId
          && entry.x === right.addChildTargets[index]?.x
          && entry.y === right.addChildTargets[index]?.y
          && entry.placement === right.addChildTargets[index]?.placement
        ))
      )
    )
  })
})
