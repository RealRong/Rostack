import type {
  EngineReadApi
} from '../api/public'
import {
  createStoreEntityRead
} from '../read/entities'
import {
  selectDoc
} from './base'
import type {
  Store
} from './state'

export const createReadApi = (
  store: Store
): EngineReadApi => {
  const entities = createStoreEntityRead(store)

  return {
    document: selectDoc({
      store,
      read: document => document
    }),
    recordIds: entities.recordIds,
    record: entities.record,
    customFieldIds: entities.customFieldIds,
    customFields: entities.customFields,
    customField: entities.customField,
    viewIds: entities.viewIds,
    views: entities.views,
    view: entities.view
  }
}
