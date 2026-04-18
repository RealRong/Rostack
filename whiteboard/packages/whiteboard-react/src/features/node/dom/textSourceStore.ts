import type { TextSourceRef } from '@whiteboard/editor/types/layout'

const readTextSourceStoreKey = (
  source: TextSourceRef
) => `node:${source.nodeId}:${source.field}`

export type TextSourceStore = {
  set: (
    source: TextSourceRef,
    element: HTMLElement | null
  ) => void
  get: (
    source: TextSourceRef
  ) => HTMLElement | undefined
}

export const createTextSourceStore = (): TextSourceStore => {
  const registry = new Map<string, HTMLElement>()

  return {
    set: (source, element) => {
      const key = readTextSourceStoreKey(source)
      if (element) {
        registry.set(key, element)
        return
      }

      registry.delete(key)
    },
    get: (source) => registry.get(readTextSourceStoreKey(source))
  }
}
