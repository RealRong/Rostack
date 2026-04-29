import {
  parseClipboardPacket,
  serializeClipboardPacket
} from '@whiteboard/editor/clipboard/packet'
import { createEditor } from '@whiteboard/editor/editor/createEditor'

export const editor = {
  create: createEditor,
  clipboard: {
    parse: parseClipboardPacket,
    serialize: serializeClipboardPacket
  }
} as const

export type {
  DrawMode
} from '@whiteboard/editor/session/draw/model'
export type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
export type {
  ClipboardPacket
} from '@whiteboard/editor/clipboard/packet'
export type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/session/edit'
export type {
  Editor
} from '@whiteboard/editor/types/editor'
export type {
  ClipboardTarget
} from '@whiteboard/editor/action/types'
export type {
  ContextMenuInput,
  ContextMenuIntent,
  KeyboardInput,
  ModifierKeys,
  PointerDownInput,
  PointerInput,
  PointerMoveInput,
  PointerSample,
  PointerUpInput,
  WheelInput
} from '@whiteboard/editor/types/input'
export type {
  EditorPick
} from '@whiteboard/editor/types/pick'
export type {
  Tool
} from '@whiteboard/editor/types/tool'
export type {
  ControlId,
  NodeFamily,
  NodeHit,
  NodeMeta,
  NodeBehaviorSpec,
  NodeFieldKey,
  NodeFieldSpec,
  NodeFieldValueKind,
  NodeSchemaSpec,
  NodeSpec,
  NodeSpecEntry,
  NodeSpecReader
} from '@whiteboard/editor/types/node'
export type {
  LayoutBackend,
  LayoutBackendRequest,
  LayoutTypography,
  WhiteboardLayoutService,
  LayoutNodeCatalog
} from '@whiteboard/core/layout'
export type {
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarScope
} from '@whiteboard/editor/types/selectionPresentation'
