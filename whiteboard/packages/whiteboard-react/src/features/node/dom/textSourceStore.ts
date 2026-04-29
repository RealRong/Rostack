import type { LayoutSourceRef } from '@whiteboard/core/layout'

const readTextSourceStoreKey = (
  source: LayoutSourceRef
) => {
  switch (source.kind) {
    case 'node':
      return `node:${source.nodeId}:${source.field}`
    case 'edge-label':
      return `edge-label:${source.edgeId}:${source.labelId}`
  }
}

export type TextSourceStore = {
    set: (
    source: LayoutSourceRef,
    element: HTMLElement | null
  ) => void
  get: (
    source: LayoutSourceRef
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
