import type { DocumentReadApi } from '../contracts/public'
import { createStoreEntityRead } from '../read/entities'
import { selectDocument } from './select'
import type { Store } from './store'

export const createDocumentReadApi = (
  store: Store
): DocumentReadApi => {
  const entities = createStoreEntityRead(store)

  return {
    document: selectDocument({
      store,
      read: document => document
    }),
    recordIds: entities.recordIds,
    record: entities.record,
    fieldIds: entities.fieldIds,
    field: entities.field,
    viewIds: entities.viewIds,
    view: entities.view
  }
}
