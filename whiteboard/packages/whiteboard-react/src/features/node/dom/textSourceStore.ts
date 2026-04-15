export type TextSourceId = string

export type TextSourceStore = {
  set: (
    sourceId: TextSourceId,
    element: HTMLElement | null
  ) => void
  get: (
    sourceId: TextSourceId
  ) => HTMLElement | undefined
}

export const createTextSourceStore = (): TextSourceStore => {
  const registry = new Map<string, HTMLElement>()

  return {
    set: (sourceId, element) => {
      if (element) {
        registry.set(sourceId, element)
        return
      }

      registry.delete(sourceId)
    },
    get: (sourceId) => registry.get(sourceId)
  }
}
