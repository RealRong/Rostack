import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import type {
  VirtualBlock
} from '@dataview/react/virtual'
import type {
  SelectionScope
} from '@dataview/runtime'
import type {
  TableBlockId
} from '@dataview/react/views/table/virtual/blockId'

export interface TableColumnHeaderBlock extends VirtualBlock {
  id: TableBlockId
  kind: 'column-header'
  estimatedHeight: number
  measuredHeight?: number
  scopeId: string
  scope: SelectionScope<ItemId>
  label?: string
}

export interface TableSectionHeaderBlock extends VirtualBlock {
  id: TableBlockId
  kind: 'section-header'
  estimatedHeight: number
  measuredHeight?: number
  sectionKey: SectionKey
}

export interface TableColumnFooterBlock extends VirtualBlock {
  id: TableBlockId
  kind: 'column-footer'
  estimatedHeight: number
  measuredHeight?: number
  scopeId: string
}

export interface TableCreateRecordBlock extends VirtualBlock {
  id: TableBlockId
  kind: 'create-record'
  estimatedHeight: number
  measuredHeight?: number
  sectionKey: SectionKey
}

export interface TableRowBlock extends VirtualBlock {
  id: TableBlockId
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
