import type { Action } from '@dataview/core/contracts'
import type {
  ActionResult,
  ActiveViewApi,
  DocumentSelectApi,
  FieldsApi,
  RecordsApi
} from '../contracts/public'
import { createActiveContext } from '../active/context'
import { createActiveViewReadApi } from '../active/read'
import type { RuntimeStore } from '../runtime/store'
import {
  createSearchApi,
  createFiltersApi,
  createSortApi,
  createGroupApi
} from '../active/commands/query'
import { createSectionsApi } from '../active/commands/sections'
import { createSummaryApi } from '../active/commands/summary'
import { createDisplayApi } from '../active/commands/display'
import { createTableApi } from '../active/commands/table'
import { createGalleryApi } from '../active/commands/gallery'
import { createKanbanApi } from '../active/commands/kanban'
import { createActiveItemsApi } from '../active/commands/items'
import { createCellsApi } from '../active/commands/cells'

export const createActiveViewApi = (options: {
  store: RuntimeStore
  select: DocumentSelectApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
  fields: Pick<FieldsApi, 'list' | 'create'>
  records: Pick<RecordsApi, 'values'>
}): ActiveViewApi => {
  const base = createActiveContext(options)
  const readApi = createActiveViewReadApi({
    select: options.select,
    state: base.state
  })
  const display = createDisplayApi(base)

  return {
    id: base.id,
    config: base.config,
    state: base.state,
    select: base.select,
    read: readApi,
    changeType: type => {
      base.commitPatch({
        type
      })
    },
    search: createSearchApi(base),
    filters: createFiltersApi(base),
    sort: createSortApi(base),
    group: createGroupApi(base),
    sections: createSectionsApi(base),
    summary: createSummaryApi(base),
    display,
    table: createTableApi({
      base,
      display
    }),
    gallery: createGalleryApi(base),
    kanban: createKanbanApi(base),
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
