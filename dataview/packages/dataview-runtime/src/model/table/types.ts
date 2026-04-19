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
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'

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
  body: ReadStore<TableBody | null>
  column: KeyedReadStore<FieldId, TableColumn | undefined>
  section: KeyedReadStore<SectionKey, TableSection | undefined>
  summary: KeyedReadStore<SectionKey, TableSummary | undefined>
}
