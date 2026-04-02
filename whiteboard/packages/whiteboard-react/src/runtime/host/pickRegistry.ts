import type { EditorPick } from '@whiteboard/editor'

export type PickRegistry = {
  bind: (element: Element, pick: EditorPick) => () => void
  element: (element: Element | null, within?: Element) => EditorPick | undefined
}

type PickEntry = {
  pick: EditorPick
}

export const createPickRegistry = (): PickRegistry => {
  const picks = new WeakMap<Element, PickEntry>()

  return {
    bind: (element, pick) => {
      const entry: PickEntry = {
        pick
      }
      picks.set(element, entry)

      return () => {
        if (picks.get(element) === entry) {
          picks.delete(element)
        }
      }
    },
    element: (element, within) => {
      let current = element

      while (current) {
        const entry = picks.get(current)
        if (entry) {
          return entry.pick
        }

        if (within && current === within) {
          break
        }

        current = current.parentElement
      }

      return undefined
    }
  }
}
