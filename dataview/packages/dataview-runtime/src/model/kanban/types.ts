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
import { store } from '@shared/core'
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
  board: store.ReadStore<KanbanBoard | null>
  section: store.KeyedReadStore<SectionKey, KanbanSection | undefined>
  card: store.KeyedReadStore<ItemId, KanbanCard | undefined>
  content: store.KeyedReadStore<ItemId, CardContent | undefined>
}
