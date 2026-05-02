import type {
  EditorScene,
  Capture
} from '@whiteboard/editor-scene'
import { store } from '@shared/core'
import { createEditorChromeUi } from '@whiteboard/editor/scene-ui/chrome'
import { createEditorMindmapUi } from '@whiteboard/editor/scene-ui/mindmap'
import { createEditorSelectionUi } from '@whiteboard/editor/scene-ui/selection'
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/node'
import type { EditorSceneFacade } from '@whiteboard/editor/api/editor'
import type { EditorSceneUi, EditorState } from '@whiteboard/editor/scene-ui/types'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'

const BASE_BACKGROUND_STEP = 24
const MIN_BACKGROUND_STEP = 14
const DEFAULT_BACKGROUND_COLOR = 'rgb(from var(--ui-text-primary) r g b / 0.08)'

const resolveBackgroundStep = (zoom: number) => {
  let step = BASE_BACKGROUND_STEP * Math.max(zoom, 0.0001)
  while (step < MIN_BACKGROUND_STEP) {
    step *= 2
  }
  return step
}

type EditorSceneUiProjection = EditorScene & {
  ui: Omit<EditorSceneUi, 'state'>
}

export const createEditorSceneUi = (input: {
  scene: EditorScene
  state: EditorState
  viewport: EditorViewport
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['selection']
}): EditorSceneUiProjection => {
  const background = store.value(() => {
    const current = store.read(input.scene.stores.document.background)
    const view = store.read(input.viewport.value)
    const type = current?.type ?? 'none'

    if (type === 'none') {
      return {
        type: 'none'
      } as const
    }

    return {
      type,
      color: current?.color ?? DEFAULT_BACKGROUND_COLOR,
      step: resolveBackgroundStep(view.zoom),
      offset: {
        x: view.center.x * view.zoom,
        y: view.center.y * view.zoom
      }
    } as const
  })
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
      background,
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
