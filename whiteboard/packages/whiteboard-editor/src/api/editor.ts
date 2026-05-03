import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  Capture,
  DocumentFrame,
  EditorScene
} from '@whiteboard/editor-scene'
import type { EditorActions } from '@whiteboard/editor/actions/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type {
  EditorStateStoreFacade
} from '@whiteboard/editor/state/runtime'
import type {
  EditorStateStores
} from '@whiteboard/editor/scene-ui/state'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'
import type { PointerMode } from '@whiteboard/editor/input/core/types'
import type {
  ContextMenuInput,
  ContextMenuIntent,
  KeyboardInput,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  WheelInput
} from '@whiteboard/editor/api/input'
import type {
  EditorSceneUi,
} from '@whiteboard/editor/scene-ui/types'
import type { NodeTypeSupport } from '@whiteboard/editor/node'
import type { EditorWrite } from '@whiteboard/editor/write'
import type { BoardConfig } from '@whiteboard/engine/config'

export type { EditorScene } from '@whiteboard/editor-scene'

export type EditorPointerDispatchResult = {
  handled: boolean
  continuePointer: boolean
}

export type EditorInputHost = {
  pointerMode: (phase: 'move' | 'up') => PointerMode
  contextMenu: (input: ContextMenuInput) => ContextMenuIntent | null
  pointerDown: (input: PointerDownInput) => EditorPointerDispatchResult
  pointerMove: (input: PointerMoveInput) => boolean
  pointerUp: (input: PointerUpInput) => boolean
  pointerCancel: (input: {
    pointerId: number
  }) => boolean
  pointerLeave: () => void
  wheel: (input: WheelInput) => boolean
  cancel: () => void
  keyDown: (input: KeyboardInput) => boolean
  keyUp: (input: KeyboardInput) => boolean
  blur: () => void
}

export type EditorSceneFacade = EditorScene & {
  ui: EditorSceneUi
  capture(): Capture
}

export type EditorRuntime = {
  config: BoardConfig
  nodeType: NodeTypeSupport
  snap: SnapRuntime
}

export type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  input: EditorInputHost
  actions: EditorActions
  write: EditorWrite
  state: EditorStateStoreFacade & {
    stores: EditorStateStores
  }
  viewport: EditorViewport
  runtime: EditorRuntime
  dispose: () => void
}

export type ClipboardDocumentSource = Pick<DocumentFrame, 'slice'>
export type EditorSliceResult = SliceExportResult | undefined
