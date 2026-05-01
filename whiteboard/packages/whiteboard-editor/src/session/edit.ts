import type {
  EdgeId,
  NodeId,
  Point
} from '@whiteboard/core/types'

export type EditField = 'text' | 'title'
export type EditEmptyBehavior = 'keep' | 'remove' | 'default'

export type EditCapability = {
  placeholder?: string
  multiline: boolean
  empty: EditEmptyBehavior
  defaultText?: string
}

export type EditCaret =
  | {
      kind: 'end'
    }
  | {
      kind: 'point'
      client: Point
    }

type EditSessionBase = {
  text: string
  composing: boolean
  caret: EditCaret
}

export type NodeEditSession = EditSessionBase & {
  kind: 'node'
  nodeId: NodeId
  field: EditField
}

export type EdgeLabelEditSession = EditSessionBase & {
  kind: 'edge-label'
  edgeId: EdgeId
  labelId: string
}

export type EditSession =
  | NodeEditSession
  | EdgeLabelEditSession
  | null
