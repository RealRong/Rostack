import type { EditorPick } from '@whiteboard/editor/api/pick'
import type { HoverState } from '@whiteboard/editor-scene'
import {
  EMPTY_HOVER_STATE,
  isEditorHoverStateEqual,
  normalizeEditorHoverState,
  toSceneHoverState,
  type EditorHoverState
} from '@whiteboard/editor/state/document'

export type { EditorHoverState }
export type { HoverState } from '@whiteboard/editor-scene'

export {
  EMPTY_HOVER_STATE,
  isEditorHoverStateEqual as isHoverStateEqual,
  normalizeEditorHoverState as normalizeHoverState,
  toSceneHoverState
}

export const toEditorHoverState = (
  value: HoverState
): EditorHoverState => {
  switch (value.kind) {
    case 'node':
      return {
        node: value.nodeId,
        edge: null,
        mindmap: null,
        group: null,
        selectionBox: false
      }
    case 'edge':
      return {
        node: null,
        edge: value.edgeId,
        mindmap: null,
        group: null,
        selectionBox: false
      }
    case 'mindmap':
      return {
        node: null,
        edge: null,
        mindmap: value.mindmapId,
        group: null,
        selectionBox: false
      }
    case 'group':
      return {
        node: null,
        edge: null,
        mindmap: null,
        group: value.groupId,
        selectionBox: false
      }
    case 'selection-box':
      return {
        node: null,
        edge: null,
        mindmap: null,
        group: null,
        selectionBox: true
      }
    default:
      return EMPTY_HOVER_STATE
  }
}

export const toHoverStateFromPick = (
  pick: EditorPick
): EditorHoverState => {
  switch (pick.kind) {
    case 'selection-box':
      return {
        node: null,
        edge: null,
        mindmap: null,
        group: null,
        selectionBox: true
      }
    case 'node':
      return {
        node: pick.id,
        edge: null,
        mindmap: null,
        group: null,
        selectionBox: false
      }
    case 'edge':
      return {
        node: null,
        edge: pick.id,
        mindmap: null,
        group: null,
        selectionBox: false
      }
    case 'group':
      return {
        node: null,
        edge: null,
        mindmap: null,
        group: pick.id,
        selectionBox: false
      }
    case 'mindmap':
      return {
        node: null,
        edge: null,
        mindmap: pick.treeId,
        group: null,
        selectionBox: false
      }
    default:
      return EMPTY_HOVER_STATE
  }
}

export const mergeHoverState = (
  value: Partial<EditorHoverState>
): EditorHoverState => normalizeEditorHoverState({
  ...EMPTY_HOVER_STATE,
  ...value
})
