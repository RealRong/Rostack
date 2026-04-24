import type {
  ReducerDraft,
  ReducerDraftAdapter
} from './contracts'

const cloneContainer = <T>(
  value: T
): T => {
  if (Array.isArray(value)) {
    return [...value] as T
  }

  return {
    ...(value as Record<PropertyKey, unknown>)
  } as T
}

export const defaultDraftAdapter = {
  create: <Doc extends object>(
    doc: Doc
  ): ReducerDraft<Doc> => {
    let current = doc
    let written = false

    const write = (): Doc => {
      if (!written) {
        current = cloneContainer(doc)
        written = true
      }

      return current
    }

    return {
      base: doc,
      doc: () => current,
      write,
      done: () => current
    }
  }
} satisfies ReducerDraftAdapter<object>
