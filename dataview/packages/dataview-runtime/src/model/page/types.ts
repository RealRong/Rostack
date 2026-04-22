import type {
  Field,
  SortRule,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ActiveViewQuery
} from '@dataview/engine'
import type {
  QueryBarEntry,
  QueryBarState,
  SettingsRoute
} from '@dataview/runtime/session/page'
import { store } from '@shared/core'


export interface PageBody {
  viewType?: View['type']
  empty: boolean
  valueEditorOpen: boolean
  locked: boolean
}

export interface PageHeader {
  viewId?: ViewId
  viewType?: View['type']
  viewName?: string
}

export interface PageToolbar {
  views: readonly View[]
  activeView?: View
  activeViewId?: ViewId
  queryBar: QueryBarState
  search: string
  filterCount: number
  sortCount: number
  availableFilterFields: readonly Field[]
  availableSortFields: readonly Field[]
}

export interface PageQuery {
  visible: boolean
  route: QueryBarEntry | null
  activeView?: View
  filters: ActiveViewQuery['filters']['rules']
  sorts: ActiveViewQuery['sort']['rules']
  availableFilterFields: readonly Field[]
  availableSortFields: readonly Field[]
}

export interface PageSortPanel {
  rules: ActiveViewQuery['sort']['rules']
  availableFields: readonly Field[]
}

export interface PageSortRow {
  rule: SortRule
  field?: Field
  availableFields: readonly Field[]
}

export interface PageSettings {
  visible: boolean
  route: SettingsRoute
  viewsCount: number
  fields: readonly Field[]
  displayFieldIds: readonly Field['id'][]
  visibleFields: readonly Field[]
  hiddenFields: readonly Field[]
  activeView?: View
  filter?: ActiveViewQuery['filters']
  sort?: ActiveViewQuery['sort']
  group?: ActiveViewQuery['group']
}

export interface PageModel {
  body: store.ReadStore<PageBody>
  header: store.ReadStore<PageHeader>
  toolbar: store.ReadStore<PageToolbar>
  query: store.ReadStore<PageQuery>
  sortPanel: store.ReadStore<PageSortPanel>
  sortRow: store.KeyedReadStore<SortRule['id'], PageSortRow | undefined>
  settings: store.ReadStore<PageSettings>
}
