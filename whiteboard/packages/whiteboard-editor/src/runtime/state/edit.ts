import type { EdgeId, NodeId, Point } from '@whiteboard/core/types'
import { createValueStore, type ValueStore } from '@shared/store'

export type EditField = 'text' | 'title'

export type EditCaret =
  | {
      kind: 'end'
    }
  | {
      kind: 'point'
      client: Point
    }

export type NodeEditTarget = {
  kind: 'node'
  nodeId: NodeId
  field: EditField
  caret: EditCaret
}

export type EdgeLabelEditTarget = {
  kind: 'edge-label'
  edgeId: EdgeId
  labelId: string
  caret: EditCaret
}

export type EditTarget =
  | NodeEditTarget
  | EdgeLabelEditTarget
  | null

export type EditStore = ValueStore<EditTarget>

export type EditMutate = {
  startNode: (
    nodeId: NodeId,
    field: EditField,
    options?: {
      caret?: EditCaret
    }
  ) => void
  startEdgeLabel: (
    edgeId: EdgeId,
    labelId: string,
    options?: {
      caret?: EditCaret
    }
  ) => void
  clear: () => void
}

export type EditState = {
  source: EditStore
  mutate: EditMutate
}

export const createEditState = (): EditState => {
  const source = createValueStore<EditTarget>(null)

  return {
    source,
    mutate: {
      startNode: (nodeId, field, options) => {
        source.set({
          kind: 'node',
          nodeId,
          field,
          caret: options?.caret ?? { kind: 'end' }
        })
      },
      startEdgeLabel: (edgeId, labelId, options) => {
        source.set({
          kind: 'edge-label',
          edgeId,
          labelId,
          caret: options?.caret ?? { kind: 'end' }
        })
      },
      clear: () => {
        if (source.get() === null) {
          return
        }

        source.set(null)
      }
    }
  }
}
