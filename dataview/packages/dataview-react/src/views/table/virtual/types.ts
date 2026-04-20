import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import type {
  VirtualBlock
} from '@dataview/react/virtual'
import type {
  SelectionScope
} from '@dataview/runtime/selection'

export interface TableColumnHeaderBlock extends VirtualBlock {
  kind: 'column-header'
  estimatedHeight: number
  measuredHeight?: number
  scopeId: string
  scope: SelectionScope<ItemId>
  label?: string
}

export interface TableSectionHeaderBlock extends VirtualBlock {
  kind: 'section-header'
  estimatedHeight: number
  measuredHeight?: number
  sectionKey: SectionKey
}

export interface TableColumnFooterBlock extends VirtualBlock {
  kind: 'column-footer'
  estimatedHeight: number
  measuredHeight?: number
  scopeId: string
}

export interface TableCreateRecordBlock extends VirtualBlock {
  kind: 'create-record'
  estimatedHeight: number
  measuredHeight?: number
  sectionKey: SectionKey
}

export interface TableRowBlock extends VirtualBlock {
  kind: 'row'
  estimatedHeight: number
  measuredHeight?: number
  rowId: ItemId
}

export type TableBlock =
  | TableColumnHeaderBlock
  | TableColumnFooterBlock
  | TableCreateRecordBlock
  | TableSectionHeaderBlock
  | TableRowBlock
