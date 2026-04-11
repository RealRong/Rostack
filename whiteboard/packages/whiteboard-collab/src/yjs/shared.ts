import type { Document } from '@whiteboard/core/types'
import { assertDocument } from '@whiteboard/core/document'
export { sameJsonValue as isDeepEqual } from '@shared/core'
import * as Y from 'yjs'

export const COLLAB_ROOT_KEY = 'whiteboard'
export const COLLAB_DOCUMENT_KEY = 'document'
export const COLLAB_SCHEMA_VERSION_KEY = 'version'
export const COLLAB_SCHEMA_VERSION = 1

export const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

export const cloneJsonValue = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {}
    Object.entries(value).forEach(([key, entry]) => {
      next[key] = cloneJsonValue(entry)
    })
    return next as T
  }

  return value
}

export const toYValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const target = new Y.Array<unknown>()
    if (value.length > 0) {
      target.insert(0, value.map((entry) => toYValue(entry)))
    }
    return target
  }

  if (isPlainObject(value)) {
    const target = new Y.Map<unknown>()
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) {
        return
      }
      target.set(key, toYValue(entry))
    })
    return target
  }

  return value
}

export const fromYValue = (value: unknown): unknown => {
  if (value instanceof Y.Map) {
    const next: Record<string, unknown> = {}
    value.forEach((entry, key) => {
      next[key] = fromYValue(entry)
    })
    return next
  }

  if (value instanceof Y.Array) {
    return value.toArray().map((entry) => fromYValue(entry))
  }

  return value
}

export const getCollabRoot = (
  doc: Y.Doc
): Y.Map<unknown> => doc.getMap(COLLAB_ROOT_KEY)

export const readCollabDocumentMap = (
  doc: Y.Doc
): Y.Map<unknown> | undefined => {
  const root = getCollabRoot(doc)
  const current = root.get(COLLAB_DOCUMENT_KEY)
  return current instanceof Y.Map
    ? current
    : undefined
}

export const ensureCollabDocumentMap = (
  doc: Y.Doc
): Y.Map<unknown> => {
  const current = readCollabDocumentMap(doc)
  if (current) {
    return current
  }

  const next = new Y.Map<unknown>()
  getCollabRoot(doc).set(COLLAB_DOCUMENT_KEY, next)
  return next
}

export const writeSchemaVersion = (
  doc: Y.Doc
) => {
  getCollabRoot(doc).set(COLLAB_SCHEMA_VERSION_KEY, COLLAB_SCHEMA_VERSION)
}

export const replaceYMapEntry = (
  map: Y.Map<unknown>,
  key: string,
  value: unknown
) => {
  if (value === undefined) {
    map.delete(key)
    return
  }

  map.set(key, toYValue(value))
}

export const replaceYArrayValues = (
  array: Y.Array<unknown>,
  values: readonly unknown[]
) => {
  if (array.length > 0) {
    array.delete(0, array.length)
  }
  if (values.length > 0) {
    array.insert(0, values.map((entry) => toYValue(entry)))
  }
}

export const ensureYArrayEntry = (
  map: Y.Map<unknown>,
  key: string
): Y.Array<unknown> => {
  const current = map.get(key)
  if (current instanceof Y.Array) {
    return current
  }

  const next = new Y.Array<unknown>()
  map.set(key, next)
  return next
}

export const ensureYMapEntry = (
  map: Y.Map<unknown>,
  key: string
): Y.Map<unknown> => {
  const current = map.get(key)
  if (current instanceof Y.Map) {
    return current
  }

  const next = new Y.Map<unknown>()
  map.set(key, next)
  return next
}

export const getYMapEntry = (
  map: Y.Map<unknown>,
  key: string
): Y.Map<unknown> | undefined => {
  const current = map.get(key)
  return current instanceof Y.Map
    ? current
    : undefined
}

export const getYArrayEntry = (
  map: Y.Map<unknown>,
  key: string
): Y.Array<unknown> | undefined => {
  const current = map.get(key)
  return current instanceof Y.Array
    ? current
    : undefined
}

export const appendUniqueToYArray = (
  array: Y.Array<unknown>,
  value: string
) => {
  const exists = array.toArray().some((entry) => entry === value)
  if (!exists) {
    array.push([value])
  }
}

export const removeFromYArray = (
  array: Y.Array<unknown>,
  value: string
) => {
  const values = array.toArray()
  const index = values.indexOf(value)
  if (index >= 0) {
    array.delete(index, 1)
  }
}

export const readDocumentLikeFromYDoc = (
  doc: Y.Doc
): Document | undefined => {
  const current = readCollabDocumentMap(doc)
  if (!current) {
    return undefined
  }

  return assertDocument(fromYValue(current) as Document)
}
