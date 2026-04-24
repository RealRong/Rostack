import type {
  DataDoc,
  Intent as CoreIntent
} from '@dataview/core/contracts'
import type {
  ActiveViewApi,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  BatchExecuteResult,
  ExecuteResult,
} from '@dataview/engine/types/intent'
import { createActiveContext } from '@dataview/engine/active/api/context'
import { createActiveViewReadApi } from '@dataview/engine/active/api/read'
import {
  createFiltersApi,
  createGroupApi,
  createSearchApi,
  createSectionsApi,
  createSortApi
} from '@dataview/engine/active/api/query'
import {
  createDisplayApi,
  createGalleryApi,
  createKanbanApi,
  createSummaryApi,
  createTableApi
} from '@dataview/engine/active/api/layout'
import { createActiveRecordsApi } from '@dataview/engine/active/api/records'
import {
  createActiveItemsApi,
  createCellsApi
} from '@dataview/engine/active/api/items'

export const createActiveViewApi = (options: {
  document: () => DataDoc
  active: () => ViewState | undefined
  execute: (intent: CoreIntent) => ExecuteResult
  executeMany: (intents: readonly CoreIntent[]) => BatchExecuteResult
}): ActiveViewApi => {
  const base = createActiveContext({
    document: options.document,
    active: options.active,
    execute: options.execute,
    executeMany: options.executeMany
  })
  const readApi = createActiveViewReadApi({
    reader: base.reader,
    state: base.state
  })
  const display = createDisplayApi(base)

  return {
    id: base.id,
    view: base.view,
    state: base.state,
    read: readApi,
    changeType: (type) => {
      base.patchView(() => ({
        type
      }))
    },
    search: createSearchApi(base),
    filters: createFiltersApi(base),
    sort: createSortApi(base),
    group: createGroupApi(base),
    sections: createSectionsApi(base),
    summary: createSummaryApi(base),
    display,
    table: createTableApi({
      base
    }),
    gallery: createGalleryApi(base),
    kanban: createKanbanApi(base),
    records: createActiveRecordsApi({
      base
    }),
    items: createActiveItemsApi({
      base,
      read: readApi
    }),
    cells: createCellsApi({
      base,
      read: readApi
    })
  }
}
