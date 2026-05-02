import type {
  HoverState
} from '@whiteboard/editor-scene'
import type { EditorPick } from '@whiteboard/editor/api/pick'

export type { HoverState } from '@whiteboard/editor-scene'

export const EMPTY_HOVER_STATE: HoverState = {
  kind: 'none'
}

export const isHoverStateEqual = (
  left: HoverState,
  right: HoverState
): boolean => {
  if (left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return right.kind === 'node' && left.nodeId === right.nodeId
    case 'edge':
      return right.kind === 'edge' && left.edgeId === right.edgeId
    case 'mindmap':
      return right.kind === 'mindmap' && left.mindmapId === right.mindmapId
    case 'group':
      return right.kind === 'group' && left.groupId === right.groupId
    case 'selection-box':
      return right.kind === 'selection-box'
    default:
      return true
  }
}

export const normalizeHoverState = (
  value: HoverState
): HoverState => {
  switch (value.kind) {
    case 'node':
      return {
        kind: 'node',
        nodeId: value.nodeId
      }
    case 'edge':
      return {
        kind: 'edge',
        edgeId: value.edgeId
      }
    case 'mindmap':
      return {
        kind: 'mindmap',
        mindmapId: value.mindmapId
      }
    case 'group':
      return {
        kind: 'group',
        groupId: value.groupId
      }
    case 'selection-box':
      return {
        kind: 'selection-box'
      }
    default:
      return EMPTY_HOVER_STATE
  }
}

export const toHoverStateFromPick = (
  pick: EditorPick
): HoverState => {
  switch (pick.kind) {
    case 'selection-box':
      return {
        kind: 'selection-box'
      }
    case 'node':
      return {
        kind: 'node',
        nodeId: pick.id
      }
    case 'edge':
      return {
        kind: 'edge',
        edgeId: pick.id
      }
    case 'group':
      return {
        kind: 'group',
        groupId: pick.id
      }
    case 'mindmap':
      return {
        kind: 'mindmap',
        mindmapId: pick.treeId
      }
    default:
      return EMPTY_HOVER_STATE
  }
}
