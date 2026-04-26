import { store as coreStore } from '@shared/core'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import {
  EMPTY_EDGE_GUIDE,
  isEdgeGuideEqual
} from '@whiteboard/editor/session/preview/edge'
import type { EdgeGuide } from '@whiteboard/editor/session/preview/types'
import type { EditorPick } from '@whiteboard/editor/types/pick'

export type HoverTarget =
  | {
      kind: 'node'
      nodeId: NodeId
    }
  | {
      kind: 'edge'
      edgeId: EdgeId
    }
  | {
      kind: 'mindmap'
      mindmapId: MindmapId
    }
  | {
      kind: 'group'
      groupId: GroupId
    }
  | {
      kind: 'selection-box'
    }

export type HoverState = {
  target?: HoverTarget
  edgeGuide?: EdgeGuide
}

export type HoverStore = Pick<coreStore.ReadStore<HoverState>, 'get' | 'subscribe'> & {
  set: (
    next:
      | HoverState
      | ((current: HoverState) => HoverState)
  ) => void
  reset: () => void
}

const EMPTY_HOVER_STATE: HoverState = {}

export const isHoverTargetEqual = (
  left: HoverTarget | undefined,
  right: HoverTarget | undefined
): boolean => {
  if (left === right) {
    return true
  }
  if (!left || !right || left.kind !== right.kind) {
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
  }
}

export const toHoverTargetFromPick = (
  pick: EditorPick
): HoverTarget | undefined => {
  switch (pick.kind) {
    case 'background':
      return undefined
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
  }
}

const isHoverStateEqual = (
  left: HoverState,
  right: HoverState
): boolean => (
  isHoverTargetEqual(left.target, right.target)
  && isEdgeGuideEqual(
    left.edgeGuide ?? EMPTY_EDGE_GUIDE,
    right.edgeGuide ?? EMPTY_EDGE_GUIDE
  )
)

export const createHoverStore = (): HoverStore => {
  const hoverStore = coreStore.createValueStore<HoverState>(EMPTY_HOVER_STATE, {
    isEqual: isHoverStateEqual
  })
  let current = EMPTY_HOVER_STATE

  return {
    get: hoverStore.get,
    subscribe: hoverStore.subscribe,
    set: (next) => {
      current = typeof next === 'function'
        ? next(current)
        : next
      hoverStore.set(current)
    },
    reset: () => {
      current = EMPTY_HOVER_STATE
      hoverStore.set(EMPTY_HOVER_STATE)
    }
  }
}
