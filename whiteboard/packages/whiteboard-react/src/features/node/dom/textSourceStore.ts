import type { NodeId } from '@whiteboard/core/types'

export type TextField = 'text' | 'title'

export type TextSourceStore = {
  set: (
    nodeId: NodeId,
    field: TextField,
    element: HTMLElement | null
  ) => void
  get: (
    nodeId: NodeId,
    field: TextField
  ) => HTMLElement | undefined
}

const toSourceKey = (
  nodeId: NodeId,
  field: TextField
) => `${nodeId}:${field}`

export const createTextSourceStore = (): TextSourceStore => {
  const registry = new Map<string, HTMLElement>()

  return {
    set: (nodeId, field, element) => {
      const key = toSourceKey(nodeId, field)
      if (element) {
        registry.set(key, element)
        return
      }

      registry.delete(key)
    },
    get: (nodeId, field) => registry.get(toSourceKey(nodeId, field))
  }
}
