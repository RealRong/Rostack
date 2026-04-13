import type { Action } from '@dataview/core/contracts'
import type {
  ActionResult,
  DocumentReadApi,
  FieldsApi,
  RecordsApi,
  ViewApi
} from '../../contracts/public'
import type { Store } from '../../state/store'
import {
  createViewBase
} from './base'
import {
  createViewReadApi
} from './read'
import {
  createSearchApi,
  createFiltersApi,
  createSortApi,
  createGroupApi
} from './query'
import { createSectionsApi } from './sections'
import { createSummaryApi } from './summary'
import { createDisplayApi } from './display'
import { createTableApi } from './table'
import { createGalleryApi } from './gallery'
import { createKanbanApi } from './kanban'
import { createViewItemsApi } from './items'
import { createCellsApi } from './cells'

export const createViewApi = (options: {
  store: Store
  read: DocumentReadApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
  fields: Pick<FieldsApi, 'list' | 'create'>
  records: Pick<RecordsApi, 'values'>
}): ViewApi => {
  const base = createViewBase(options)
  const readApi = createViewReadApi({
    read: options.read,
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
    items: createViewItemsApi({
      base,
      read: readApi
    }),
    cells: createCellsApi({
      base,
      read: readApi
    })
  }
}
