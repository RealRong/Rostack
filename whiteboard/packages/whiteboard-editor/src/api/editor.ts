import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  Capture,
  DocumentFrame,
  EditorScene
} from '@whiteboard/editor-scene'
import type { EditorActions as EditorWrite } from '@whiteboard/editor/actions/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { EditorStateDocument } from '@whiteboard/editor/state/document'
import type { EditorStateRuntime } from '@whiteboard/editor/state/runtime'
import type { EditorDispatchInput } from '@whiteboard/editor/state/intents'
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
import type { EditorWrite as EditorMutationWrite } from '@whiteboard/editor/write'
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
  actions: EditorWrite
  write: EditorMutationWrite
  state: Pick<EditorStateRuntime, 'snapshot' | 'reader' | 'write' | 'commits'>
  viewport: EditorViewport
  read: () => EditorStateDocument
  runtime: EditorRuntime
  dispatch: (command: EditorDispatchInput | readonly EditorDispatchInput[]) => void
  dispose: () => void
}

export type ClipboardDocumentSource = Pick<DocumentFrame, 'slice'>
export type EditorSliceResult = SliceExportResult | undefined
