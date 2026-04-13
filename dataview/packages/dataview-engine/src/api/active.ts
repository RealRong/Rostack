import type { Action } from '@dataview/core/contracts'
import type {
  ActionResult,
  ActiveViewApi,
  DocumentSelectApi,
  FieldsApi,
  RecordsApi
} from '#engine/contracts/public.ts'
import { createActiveContext } from '#engine/active/context.ts'
import { createActiveViewReadApi } from '#engine/active/read.ts'
import type { RuntimeStore } from '#engine/runtime/store.ts'
import {
  createSearchApi,
  createFiltersApi,
  createSortApi,
  createGroupApi
} from '#engine/active/commands/query.ts'
import { createSectionsApi } from '#engine/active/commands/sections.ts'
import { createSummaryApi } from '#engine/active/commands/summary.ts'
import { createDisplayApi } from '#engine/active/commands/display.ts'
import { createTableApi } from '#engine/active/commands/table.ts'
import { createGalleryApi } from '#engine/active/commands/gallery.ts'
import { createKanbanApi } from '#engine/active/commands/kanban.ts'
import { createActiveItemsApi } from '#engine/active/commands/items.ts'
import { createCellsApi } from '#engine/active/commands/cells.ts'

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
