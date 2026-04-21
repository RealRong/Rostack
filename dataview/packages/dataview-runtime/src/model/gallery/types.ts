import type {
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

export interface GalleryBody {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  groupUsesOptionColors: boolean
  sectionKeys: readonly SectionKey[]
}

export interface GallerySection {
  key: SectionKey
  label: Section['label']
  count: number
}

export interface GalleryCard extends Card {}

export interface DataViewGalleryModel {
  body: store.ReadStore<GalleryBody | null>
  section: store.KeyedReadStore<SectionKey, GallerySection | undefined>
  card: store.KeyedReadStore<ItemId, GalleryCard | undefined>
  content: store.KeyedReadStore<ItemId, CardContent | undefined>
}
