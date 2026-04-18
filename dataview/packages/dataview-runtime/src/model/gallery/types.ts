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
  RecordCardContentData,
  RecordCardData
} from '@dataview/runtime/model/shared'

export interface GalleryBodyBase {
  viewId: ViewId
  empty: boolean
  grouped: boolean
  groupUsesOptionColors: boolean
  sectionCountByKey: ReadonlyMap<SectionKey, number>
}

export interface GallerySectionData {
  key: SectionKey
  label: Section['label']
  count: number
}

export interface GalleryCardData extends RecordCardData {}

export interface DataViewGalleryModel {
  bodyBase: ReadStore<GalleryBodyBase | null>
  section: KeyedReadStore<SectionKey, GallerySectionData | undefined>
  card: KeyedReadStore<ItemId, GalleryCardData | undefined>
  content: KeyedReadStore<ItemId, RecordCardContentData | undefined>
}
