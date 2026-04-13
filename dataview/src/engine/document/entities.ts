import type { DataDoc } from '@dataview/core/contracts'

export interface DocumentEntityRead<TId, T> {
  list: () => readonly T[]
  get: (id: TId) => T | undefined
  has: (id: TId) => boolean
}

export const createDocumentEntityRead = <TId, T>(
  document: DataDoc,
  input: {
    list: (document: DataDoc) => readonly T[]
    get: (document: DataDoc, id: TId) => T | undefined
  }
): DocumentEntityRead<TId, T> => ({
  list: () => input.list(document),
  get: id => input.get(document, id),
  has: id => Boolean(input.get(document, id))
})
