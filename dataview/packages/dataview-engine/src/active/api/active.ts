import type {
  ActiveViewApi
} from '@dataview/engine/contracts/view'
import type {
  Engine
} from '@dataview/engine/contracts/api'
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
  createFieldsApi,
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

export const createActiveViewApi = (
  engine: Pick<Engine, 'current' | 'doc' | 'execute'>
): ActiveViewApi => {
  const base = createActiveContext(engine)
  const readApi = createActiveViewReadApi({
    query: base.query,
    state: base.state
  })
  const fields = createFieldsApi(base)

  return {
    id: base.id,
    view: base.view,
    state: base.state,
    read: readApi,
    changeType: (type) => {
      const viewId = base.id()
      if (!viewId) {
        return
      }

      base.execute({
        type: 'view.type.set',
        id: viewId,
        viewType: type
      })
    },
    search: createSearchApi(base),
    filters: createFiltersApi(base),
    sort: createSortApi(base),
    group: createGroupApi(base),
    sections: createSectionsApi(base),
    summary: createSummaryApi(base),
    fields,
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
