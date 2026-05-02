import {
  parseClipboardPacket,
  serializeClipboardPacket
} from '@whiteboard/editor/clipboard'
import { createEditor } from '@whiteboard/editor/editor/create'

export const editor = {
  create: createEditor,
  clipboard: {
    parse: parseClipboardPacket,
    serialize: serializeClipboardPacket
  }
} as const

export type {
  DrawMode
} from '@whiteboard/editor/schema/draw-mode'
export type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
export type {
  ClipboardPacket
} from '@whiteboard/editor/clipboard'
export type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/schema/edit'
export type {
  Editor,
  EditorSceneFacade
} from '@whiteboard/editor/api/editor'
export type {
  ClipboardTarget
} from '@whiteboard/editor/actions/types'
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
} from '@whiteboard/editor/api/input'
export type {
  EditorPick
} from '@whiteboard/editor/api/pick'
export type {
  Tool
} from '@whiteboard/editor/schema/tool'
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
} from '@whiteboard/editor/node'
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
} from '@whiteboard/editor/scene-ui/schema'
