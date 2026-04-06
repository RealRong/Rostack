import type { NodeId, Point } from '@whiteboard/core/types'
import { createValueStore } from '@whiteboard/engine'
import type { ValueStore } from '@whiteboard/engine'

export type EditField = 'text' | 'title'

export type EditCaret =
  | {
      kind: 'end'
    }
  | {
      kind: 'point'
      client: Point
    }

export type EditTarget = {
  nodeId: NodeId
  field: EditField
  caret: EditCaret
} | null

export type EditStore = ValueStore<EditTarget>

export type EditMutate = {
  start: (
    nodeId: NodeId,
    field: EditField,
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
      start: (nodeId, field, options) => {
        source.set({
          nodeId,
          field,
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
