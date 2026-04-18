import type {
  CardLayout,
  CardSize,
  CustomField,
  Field,
  KanbanCardsPerColumn,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  Section,
  SectionKey
} from '@dataview/engine'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'

export interface KanbanBoardBase {
  viewId: ViewId
  grouped: boolean
  sectionKeys: readonly SectionKey[]
  groupField?: Field
  fillColumnColor: boolean
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
}

export interface KanbanSectionBase {
  key: SectionKey
  label: Section['label']
  bucket: Section['bucket'] | undefined
  collapsed: boolean
  count: number
  color?: string
}

export interface KanbanCardData {
  viewId: ViewId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
  color?: string
}

export interface DataViewKanbanModel {
  boardBase: ReadStore<KanbanBoardBase | null>
  sectionBase: KeyedReadStore<SectionKey, KanbanSectionBase | undefined>
  card: KeyedReadStore<ItemId, KanbanCardData | undefined>
}
