import type { GroupCommitChangeSet, GroupDocument } from '@dataview/core/contracts'
import type { GroupEngineReadApi } from '../../types'
import { createReadSource } from './source'

export interface CreateReadOptions {
  getDocument: () => GroupDocument
}

export interface GroupRead extends GroupEngineReadApi {
  clear: () => void
  syncDocument: (document: GroupDocument, changes?: GroupCommitChangeSet) => void
}

export const read = (options: CreateReadOptions): GroupRead => {
  const source = createReadSource(options.getDocument())
  const syncDocument = (
    document: GroupDocument,
    _changes?: GroupCommitChangeSet
  ) => {
    source.setDocument(document)
  }

  return {
    document: source.document,
    recordIds: source.recordIds,
    record: source.record,
    propertyIds: source.propertyIds,
    property: source.property,
    viewIds: source.viewIds,
    view: source.view,
    viewProjection: source.viewProjection,
    clear: () => {},
    syncDocument
  }
}
