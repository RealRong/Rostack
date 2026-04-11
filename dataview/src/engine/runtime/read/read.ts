import type { CommitDelta, DataDoc } from '@dataview/core/contracts'
import type { EngineReadApi } from '../../types'
import { createReadSource } from './source'

export interface CreateReadOptions {
  getDocument: () => DataDoc
}

export interface ReadRuntime extends EngineReadApi {
  clear: () => void
  syncDocument: (document: DataDoc, changes?: CommitDelta) => void
}

export const read = (options: CreateReadOptions): ReadRuntime => {
  const source = createReadSource(options.getDocument())
  const syncDocument = (
    document: DataDoc,
    _changes?: CommitDelta
  ) => {
    source.setDocument(document)
  }

  return {
    document: source.document,
    activeViewId: source.activeViewId,
    activeView: source.activeView,
    recordIds: source.recordIds,
    record: source.record,
    customFieldIds: source.customFieldIds,
    customFields: source.customFields,
    customField: source.customField,
    viewIds: source.viewIds,
    views: source.views,
    view: source.view,
    clear: () => {},
    syncDocument
  }
}
