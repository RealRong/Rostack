import type {
  Field,
  FieldId,
  CalculationMetric,
  ViewId
} from '@dataview/core/contracts'
import type {
  CalculationResult
} from '@dataview/core/calculation'
import type {
  ItemList,
  Section,
  SectionKey,
  SectionList
} from '@dataview/engine'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'

export interface TableBase {
  viewId: ViewId
  columns: readonly Field[]
  items: ItemList
  sections: SectionList
  grouped: boolean
  showVerticalLines: boolean
  wrap: boolean
}

export interface TableHeaderData {
  grouped: boolean
  sortDirection?: 'asc' | 'desc'
  calculationMetric?: CalculationMetric
}

export interface TableFooterData {
  summaryByFieldId: ReadonlyMap<FieldId, CalculationResult>
}

export interface TableSectionData {
  key: SectionKey
  label: Section['label']
  collapsed: boolean
  count: number
}

export interface DataViewTableModel {
  base: ReadStore<TableBase | null>
  header: KeyedReadStore<FieldId, TableHeaderData>
  footer: KeyedReadStore<string, TableFooterData | undefined>
  section: KeyedReadStore<SectionKey, TableSectionData | undefined>
}
