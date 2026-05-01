import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Viewport } from '@whiteboard/core/types'
import { json } from '@shared/core'
import type {
  HoverState,
  PreviewInput
} from '@whiteboard/editor-scene'
import type { InteractionMode } from '@whiteboard/editor/input/core/types'
import {
  EMPTY_HOVER_STATE,
  isHoverStateEqual,
  normalizeHoverState
} from '@whiteboard/editor/input/hover/store'
import type { Tool } from '@whiteboard/editor/types/tool'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import {
  isDrawStateEqual,
  normalizeDrawState
} from '@whiteboard/editor/session/draw/state'
import {
  EMPTY_PREVIEW_STATE,
  isEditorPreviewStateEqual,
  normalizeEditorPreviewState
} from '@whiteboard/editor/session/preview/state'
import type {
  EditCaret,
  EditSession
} from '@whiteboard/editor/session/edit'

export interface EditorStableInteractionState {
  mode: InteractionMode
  chrome: boolean
  space: boolean
}

export interface EditorInteractionStateValue extends EditorStableInteractionState {
  hover: HoverState
}

export interface EditorStableState {
  tool: Tool
  draw: DrawState
  selection: SelectionTarget
  edit: EditSession
  interaction: EditorStableInteractionState
  viewport: Viewport
}

export interface EditorOverlayPreviewState {
  base: PreviewInput
  transient: PreviewInput
}

export interface EditorOverlayState {
  hover: HoverState
  preview: EditorOverlayPreviewState
}

export interface EditorStateDocument {
  state: EditorStableState
  overlay: EditorOverlayState
}

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

export const normalizeTool = (
  value: Tool
): Tool => {
  switch (value?.type) {
    case 'hand':
      return {
        type: 'hand'
      }
    case 'edge':
      return isObjectRecord(value.template)
        ? {
            type: 'edge',
            template: value.template
          }
        : {
            type: 'select'
          }
    case 'insert':
      return isObjectRecord(value.template)
        ? {
            type: 'insert',
            template: value.template
          }
        : {
            type: 'select'
          }
    case 'draw':
      return typeof value.mode === 'string' && value.mode.length > 0
        ? {
            type: 'draw',
            mode: value.mode
          }
        : {
            type: 'select'
          }
    case 'select':
    default:
      return {
        type: 'select'
      }
  }
}

export const isToolEqual = (
  left: Tool,
  right: Tool
): boolean => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
      return right.type === 'edge'
        && json.stableStringify(left.template) === json.stableStringify(right.template)
    case 'insert':
      return right.type === 'insert'
        && json.stableStringify(left.template) === json.stableStringify(right.template)
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

const normalizeEditCaret = (
  value: EditCaret
): EditCaret => value.kind === 'point'
  && Number.isFinite(value.client.x)
  && Number.isFinite(value.client.y)
  ? {
      kind: 'point',
      client: {
        x: value.client.x,
        y: value.client.y
      }
    }
  : {
      kind: 'end'
    }

export const normalizeEditSession = (
  value: EditSession
): EditSession => {
  if (!value) {
    return null
  }

  if (value.kind === 'node') {
    return {
      kind: 'node',
      nodeId: value.nodeId,
      field: value.field,
      text: typeof value.text === 'string'
        ? value.text
        : '',
      composing: Boolean(value.composing),
      caret: normalizeEditCaret(value.caret)
    }
  }

  return {
    kind: 'edge-label',
    edgeId: value.edgeId,
    labelId: value.labelId,
    text: typeof value.text === 'string'
      ? value.text
      : '',
    composing: Boolean(value.composing),
    caret: normalizeEditCaret(value.caret)
  }
}

export const isEditSessionEqual = (
  left: EditSession,
  right: EditSession
): boolean => {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return left === right
  }
  if (left.kind !== right.kind) {
    return false
  }

  const sameBase = (
    left.text === right.text
    && left.composing === right.composing
    && left.caret.kind === right.caret.kind
    && (
      left.caret.kind !== 'point'
      || (
        right.caret.kind === 'point'
        && left.caret.client.x === right.caret.client.x
        && left.caret.client.y === right.caret.client.y
      )
    )
  )
  if (!sameBase) {
    return false
  }

  return left.kind === 'node'
    ? right.kind === 'node'
      && left.nodeId === right.nodeId
      && left.field === right.field
    : right.kind === 'edge-label'
      && left.edgeId === right.edgeId
      && left.labelId === right.labelId
}

export const normalizeViewportValue = (
  value: Viewport
): Viewport => geometryApi.viewport.normalize(
  value,
  geometryApi.viewport.defaultLimits
)

export const normalizeInteractionMode = (
  value: InteractionMode
): InteractionMode => {
  switch (value) {
    case 'idle':
    case 'press':
    case 'draw':
    case 'viewport-pan':
    case 'marquee':
    case 'node-drag':
    case 'mindmap-drag':
    case 'node-transform':
    case 'edge-drag':
    case 'edge-label':
    case 'edge-connect':
    case 'edge-route':
      return value
    default:
      return 'idle'
  }
}

export const normalizeInteractionStateValue = (
  value: EditorStableInteractionState
): EditorStableInteractionState => ({
  mode: normalizeInteractionMode(value.mode),
  chrome: Boolean(value.chrome),
  space: Boolean(value.space)
})

export const isInteractionStateEqual = (
  left: EditorStableInteractionState,
  right: EditorStableInteractionState
): boolean => (
  left.mode === right.mode
  && left.chrome === right.chrome
  && left.space === right.space
)

export const normalizeEditorStableState = (
  value: EditorStableState
): EditorStableState => ({
  tool: normalizeTool(value.tool),
  draw: normalizeDrawState(value.draw),
  selection: selectionApi.target.normalize(value.selection),
  edit: normalizeEditSession(value.edit),
  interaction: normalizeInteractionStateValue(value.interaction),
  viewport: normalizeViewportValue(value.viewport)
})

export const normalizeEditorOverlayPreviewState = (
  value: EditorOverlayPreviewState
): EditorOverlayPreviewState => ({
  base: normalizeEditorPreviewState(value.base),
  transient: normalizeEditorPreviewState(value.transient)
})

export const isEditorOverlayPreviewStateEqual = (
  left: EditorOverlayPreviewState,
  right: EditorOverlayPreviewState
): boolean => (
  isEditorPreviewStateEqual(left.base, right.base)
  && isEditorPreviewStateEqual(left.transient, right.transient)
)

export const normalizeEditorOverlayState = (
  value: EditorOverlayState
): EditorOverlayState => ({
  hover: normalizeHoverState(value.hover),
  preview: normalizeEditorOverlayPreviewState(value.preview)
})

export const isEditorOverlayStateEqual = (
  left: EditorOverlayState,
  right: EditorOverlayState
): boolean => (
  isHoverStateEqual(left.hover, right.hover)
  && isEditorOverlayPreviewStateEqual(left.preview, right.preview)
)

export const buildEditorStateDocument = (input: {
  tool: Tool
  draw: DrawState
  selection?: SelectionTarget
  edit?: EditSession
  interaction?: EditorStableInteractionState
  hover?: HoverState
  previewBase?: PreviewInput
  previewTransient?: PreviewInput
  viewport: Viewport
}): EditorStateDocument => normalizeEditorStateDocument({
  state: {
    tool: input.tool,
    draw: input.draw,
    selection: input.selection ?? selectionApi.target.empty,
    edit: input.edit ?? null,
    interaction: input.interaction ?? {
      mode: 'idle',
      chrome: true,
      space: false
    },
    viewport: input.viewport
  },
  overlay: {
    hover: input.hover ?? EMPTY_HOVER_STATE,
    preview: {
      base: input.previewBase ?? EMPTY_PREVIEW_STATE,
      transient: input.previewTransient ?? EMPTY_PREVIEW_STATE
    }
  }
})

export const normalizeEditorStateDocument = (
  value: EditorStateDocument
): EditorStateDocument => ({
  state: normalizeEditorStableState(value.state),
  overlay: normalizeEditorOverlayState(value.overlay)
})

export const isSelectionEqual = selectionApi.target.equal
export const isDrawEqual = isDrawStateEqual
export const isViewportEqual = geometryApi.viewport.isSame
export const isPreviewEqual = isEditorPreviewStateEqual
