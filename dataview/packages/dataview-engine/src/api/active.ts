import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import type {
  ActionResult,
  ActiveViewApi,
  EngineSource
} from '@dataview/engine/contracts'
import { createActiveContext } from '@dataview/engine/active/context'
import { createActiveViewReadApi } from '@dataview/engine/active/read'
import {
  createSearchApi,
  createFiltersApi,
  createSortApi,
  createGroupApi
} from '@dataview/engine/active/commands/query'
import { createSectionsApi } from '@dataview/engine/active/commands/sections'
import { createSummaryApi } from '@dataview/engine/active/commands/summary'
import { createDisplayApi } from '@dataview/engine/active/commands/display'
import { createTableApi } from '@dataview/engine/active/commands/table'
import { createGalleryApi } from '@dataview/engine/active/commands/gallery'
import { createKanbanApi } from '@dataview/engine/active/commands/kanban'
import { createActiveRecordsApi } from '@dataview/engine/active/commands/records'
import { createActiveItemsApi } from '@dataview/engine/active/commands/items'
import { createCellsApi } from '@dataview/engine/active/commands/cells'

export const createActiveViewApi = (options: {
  document: () => DataDoc
  source: EngineSource
  state: ActiveViewApi['state']
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): ActiveViewApi => {
  const base = createActiveContext(options)
  const readApi = createActiveViewReadApi({
    reader: base.reader,
    stateStore: base.stateStore
  })
  const display = createDisplayApi(base)

  return {
    id: base.id,
    config: base.config,
    state: base.stateStore,
    read: readApi,
    changeType: type => {
      base.patch(() => ({
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
