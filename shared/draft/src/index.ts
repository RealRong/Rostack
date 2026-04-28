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
  patch,
  type RecordPatch
} from './patch'
import {
  record as createRecordDraft,
  type DraftRecord
} from './record'
import {
  record,
  type RecordWrite
} from './recordValue'
import {
  root,
  type DraftRoot
} from './root'

export const draft = {
  root,
  record,
  table: createRecordDraft,
  list,
  map: createMapDraft,
  array: createArrayDraft,
  entityTable
} as const

export {
  createArrayDraft,
  createMapDraft,
  createRecordDraft,
  entityTable,
  list,
  patch,
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
  PathKey,
  RecordPatch,
  RecordWrite
}
