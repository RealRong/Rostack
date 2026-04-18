import type { LayoutRequest } from '@whiteboard/editor'

export type TextSourceRef = NonNullable<LayoutRequest['source']>

const readTextSourceStoreKey = (
  source: TextSourceRef
) => source.kind === 'node'
  ? `node:${source.nodeId}:${source.field}`
  : `edge:${source.edgeId}:label:${source.labelId}`

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
