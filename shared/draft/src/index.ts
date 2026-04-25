import {
  createArrayDraft,
  createMapDraft,
  type ArrayDraft,
  type MapDraft
} from './collections'
import {
  entityTable,
  type DraftEntityTable,
  type DraftEntityTableOptions
} from './entityTable'
import {
  list,
  type DraftList
} from './list'
import {
  path,
  type Path,
  type PathKey
} from './path'
import {
  record,
  type DraftRecord
} from './record'
import {
  root,
  type DraftRoot
} from './root'

export const draft = {
  root,
  record,
  list,
  map: createMapDraft,
  array: createArrayDraft,
  entityTable,
  path
} as const

export {
  createArrayDraft,
  createMapDraft,
  entityTable,
  list,
  path,
  record,
  root
}

export type {
  ArrayDraft,
  DraftEntityTable,
  DraftEntityTableOptions,
  DraftList,
  MapDraft,
  DraftRecord,
  DraftRoot,
  Path,
  PathKey
}
