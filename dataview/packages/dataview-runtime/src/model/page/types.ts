import type {
  Field,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine'
import type {
  QueryBarEntry,
  QueryBarState
} from '@dataview/runtime/page/session/types'
import type {
  ReadStore
} from '@shared/core'

export interface DataViewPageBody {
  viewType?: View['type']
  empty: boolean
}

export interface DataViewPageHeader {
  viewId?: ViewId
  viewType?: View['type']
  viewName?: string
}

export interface DataViewPageToolbar {
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

export interface DataViewPageQueryBar {
  visible: boolean
  route: QueryBarEntry | null
  currentView?: View
  filters: ViewState['query']['filters']['rules']
  sorts: ViewState['query']['sort']['rules']
  availableFilterFields: readonly Field[]
  availableSortFields: readonly Field[]
}

export interface DataViewPageSettings {
  viewsCount: number
  fields: readonly Field[]
  currentView?: View
  filter?: ViewState['query']['filters']
  sort?: ViewState['query']['sort']
  group?: ViewState['query']['group']
}

export interface DataViewPageRuntime {
  body: ReadStore<DataViewPageBody>
  header: ReadStore<DataViewPageHeader>
  toolbar: ReadStore<DataViewPageToolbar>
  queryBar: ReadStore<DataViewPageQueryBar>
  settings: ReadStore<DataViewPageSettings>
}
