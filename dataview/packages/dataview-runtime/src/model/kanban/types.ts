import type {
  CardSize,
  Field,
  KanbanCardsPerColumn,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  Section,
  SectionId
} from '@dataview/engine'
import { store } from '@shared/core'
import type {
  Card,
  CardContent
} from '@dataview/runtime/model/shared'

export interface KanbanBoard {
  viewId: ViewId
  grouped: boolean
  groupField?: Field
  fillColumnColor: boolean
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
  size: CardSize
  canDrag: boolean
}

export interface KanbanSection {
  id: SectionId
  label: Section['label']
  bucket: Section['bucket'] | undefined
  collapsed: boolean
  count: number
  color?: string
}

export interface KanbanCard extends Card {
  color?: string
}

export interface KanbanModel {
  board: store.ReadStore<KanbanBoard | null>
  sections: store.ReadStore<readonly Section[]>
  section: store.KeyedReadStore<SectionId, KanbanSection | undefined>
  card: store.KeyedReadStore<ItemId, KanbanCard | undefined>
  content: store.KeyedReadStore<ItemId, CardContent | undefined>
}
