import type {
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
import type {
  Card,
  CardContent
} from '@dataview/runtime/model/shared'

export interface KanbanBoard {
  viewId: ViewId
  grouped: boolean
  sectionKeys: readonly SectionKey[]
  groupField?: Field
  fillColumnColor: boolean
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
}

export interface KanbanSection {
  key: SectionKey
  label: Section['label']
  bucket: Section['bucket'] | undefined
  collapsed: boolean
  count: number
  color?: string
}

export interface KanbanCard extends Card {
  color?: string
}

export interface DataViewKanbanModel {
  board: ReadStore<KanbanBoard | null>
  section: KeyedReadStore<SectionKey, KanbanSection | undefined>
  card: KeyedReadStore<ItemId, KanbanCard | undefined>
  content: KeyedReadStore<ItemId, CardContent | undefined>
}
