import type { Point } from '@whiteboard/core/types'
import type { Tool } from '@whiteboard/editor'

export type WhiteboardPresenceActivity =
  | 'idle'
  | 'pointing'
  | 'dragging'
  | 'editing'

export type WhiteboardPresenceUser = {
  id: string
  name: string
  color: string
}

export type WhiteboardPresencePointer = {
  world: Point
  timestamp: number
}

export type WhiteboardPresenceSelection = {
  nodeIds: readonly string[]
  edgeIds: readonly string[]
}

export type WhiteboardPresenceTool = {
  type: Tool['type']
  value?: string
}

export type WhiteboardPresenceState = {
  user: WhiteboardPresenceUser
  pointer?: WhiteboardPresencePointer
  selection?: WhiteboardPresenceSelection
  tool?: WhiteboardPresenceTool
  activity?: WhiteboardPresenceActivity
  updatedAt: number
}

export type WhiteboardPresenceBinding = {
  clientId: string
  user: WhiteboardPresenceUser
  getLocalState: () => WhiteboardPresenceState | null
  getStates: () => ReadonlyMap<string, WhiteboardPresenceState>
  setLocalState: (state: WhiteboardPresenceState | null) => void
  updateLocalState: (
    recipe: (
      prev: WhiteboardPresenceState | null
    ) => WhiteboardPresenceState | null
  ) => void
  subscribe: (listener: () => void) => () => void
}
