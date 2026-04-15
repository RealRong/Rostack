import type {
  ItemId,
  Section
} from '@dataview/engine'
import type {
  VirtualBlock
} from '@dataview/react/virtual'
import type {
  SelectionScope
} from '@dataview/react/runtime/selection'

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
  section: Section
}

export interface TableColumnFooterBlock extends VirtualBlock {
  kind: 'column-footer'
  estimatedHeight: number
  measuredHeight?: number
  scopeId: string
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
  | TableSectionHeaderBlock
  | TableRowBlock
