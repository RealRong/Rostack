import type {
  ItemId,
  Section
} from '@dataview/engine'
import type {
  VirtualBlock
} from '#dataview-react/virtual'

export interface TableColumnHeaderBlock extends VirtualBlock {
  kind: 'column-header'
  scopeId: string
  rowIds: readonly ItemId[]
  label?: string
}

export interface TableSectionHeaderBlock extends VirtualBlock {
  kind: 'section-header'
  section: Section
}

export interface TableColumnFooterBlock extends VirtualBlock {
  kind: 'column-footer'
  scopeId: string
}

export interface TableRowBlock extends VirtualBlock {
  kind: 'row'
  rowId: ItemId
}

export type TableBlock =
  | TableColumnHeaderBlock
  | TableColumnFooterBlock
  | TableSectionHeaderBlock
  | TableRowBlock
