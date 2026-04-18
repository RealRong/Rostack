import type {
  CardLayout,
  CardSize,
  CustomField,
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

export interface GalleryCardData {
  viewId: ViewId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}

export interface DataViewGalleryModel {
  bodyBase: ReadStore<GalleryBodyBase | null>
  section: KeyedReadStore<SectionKey, GallerySectionData | undefined>
  card: KeyedReadStore<ItemId, GalleryCardData | undefined>
}
