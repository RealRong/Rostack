import type {
  Field,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ActiveViewQuery
} from '@dataview/engine'
import type {
  QueryBarEntry,
  QueryBarState
} from '@dataview/runtime/page/session/types'
import type {
  ReadStore
} from '@shared/core'

export interface PageBody {
  viewType?: View['type']
  empty: boolean
}

export interface PageHeader {
  viewId?: ViewId
  viewType?: View['type']
  viewName?: string
}

export interface PageToolbar {
  views: readonly View[]
  currentView?: View
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
  currentView?: View
  filters: ActiveViewQuery['filters']['rules']
  sorts: ActiveViewQuery['sort']['rules']
  availableFilterFields: readonly Field[]
  availableSortFields: readonly Field[]
}

export interface PageSettings {
  viewsCount: number
  fields: readonly Field[]
  currentView?: View
  filter?: ActiveViewQuery['filters']
  sort?: ActiveViewQuery['sort']
  group?: ActiveViewQuery['group']
}

export interface PageModel {
  body: ReadStore<PageBody>
  header: ReadStore<PageHeader>
  toolbar: ReadStore<PageToolbar>
  query: ReadStore<PageQuery>
  settings: ReadStore<PageSettings>
}
