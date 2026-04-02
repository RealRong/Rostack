import type { NodeId } from '@whiteboard/core/types'
import { createValueStore } from '@whiteboard/engine'
import type { ValueStore } from '@whiteboard/engine'

export type EditField = 'text' | 'title'

export type EditTarget = {
  nodeId: NodeId
  field: EditField
} | null

export type EditStore = ValueStore<EditTarget>

export type EditMutate = {
  start: (nodeId: NodeId, field: EditField) => void
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
      start: (nodeId, field) => {
        source.set({
          nodeId,
          field
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
