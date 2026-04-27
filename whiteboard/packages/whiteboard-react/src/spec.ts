import { createEditorSceneRuntime } from '@whiteboard/editor-scene'
import { nodeSpec } from '@whiteboard/react/features/node'
import { toolbarSpec } from '@whiteboard/react/features/selection/chrome/toolbar/spec'

export const whiteboardSpec = {
  nodes: nodeSpec,
  toolbar: toolbarSpec,
  scene: {
    createRuntime: createEditorSceneRuntime
  }
} as const
