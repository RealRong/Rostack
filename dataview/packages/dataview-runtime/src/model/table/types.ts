import type {
  CalculationResult
} from '@dataview/core/calculation'
import type {
  CalculationMetric,
  Field,
  FieldId,
  SortDirection,
  ViewId
} from '@dataview/core/contracts'
import type {
  Section,
  SectionKey
} from '@dataview/engine'
import { store } from '@shared/core'


export interface TableBody {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  wrap: boolean
  showVerticalLines: boolean
  columnIds: readonly FieldId[]
  sectionKeys: readonly SectionKey[]
}

export interface TableColumn {
  field?: Field
  grouped: boolean
  sortDir?: SortDirection
  calc?: CalculationMetric
}

export interface TableSection {
  key: SectionKey
  label: Section['label']
  collapsed: boolean
  count: number
}

export interface TableSummary {
  byField: ReadonlyMap<FieldId, CalculationResult>
}

export interface DataViewTableModel {
  body: store.ReadStore<TableBody | null>
  column: store.KeyedReadStore<FieldId, TableColumn | undefined>
  section: store.KeyedReadStore<SectionKey, TableSection | undefined>
  summary: store.KeyedReadStore<SectionKey, TableSummary | undefined>
}
