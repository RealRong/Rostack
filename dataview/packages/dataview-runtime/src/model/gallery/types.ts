import type {
  CardSize,
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

export interface GalleryBody {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  size: CardSize
  canDrag: boolean
  groupUsesOptionColors: boolean
}

export interface GallerySection {
  id: SectionId
  label: Section['label']
  count: number
}

export interface GalleryCard extends Card {}

export interface DataViewGalleryModel {
  body: store.ReadStore<GalleryBody | null>
  sections: store.ReadStore<readonly Section[]>
  section: store.KeyedReadStore<SectionId, GallerySection | undefined>
  card: store.KeyedReadStore<ItemId, GalleryCard | undefined>
  content: store.KeyedReadStore<ItemId, CardContent | undefined>
}
