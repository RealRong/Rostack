import type {
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
  body: ReadStore<GalleryBody | null>
  section: KeyedReadStore<SectionKey, GallerySection | undefined>
  card: KeyedReadStore<ItemId, GalleryCard | undefined>
  content: KeyedReadStore<ItemId, CardContent | undefined>
}
