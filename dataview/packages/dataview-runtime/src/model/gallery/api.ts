import { equal, store } from '@shared/core'
import {
  type ItemId
} from '@dataview/engine'
import type {
  DataViewGalleryModel,
  GalleryBody,
  GalleryCard,
  GallerySection
} from '@dataview/runtime/model/gallery/types'
import {
  createItemCardContentStore,
  createRecordCardPropertiesStore
} from '@dataview/runtime/model/card'
import type {
  EngineSource
} from '@dataview/runtime/source'

const DEFAULT_GALLERY_TITLE_PLACEHOLDER = '输入名称...'
const EMPTY_SECTIONS = [] as const

const sameBody = (
  left: GalleryBody | null,
  right: GalleryBody | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.empty === right.empty
  && left.grouped === right.grouped
  && left.size === right.size
  && left.canDrag === right.canDrag
  && left.groupUsesOptionColors === right.groupUsesOptionColors
)

const sameSection = (
  left: GallerySection | undefined,
  right: GallerySection | undefined
) => left === right || (
  !!left
  && !!right
  && left.key === right.key
  && left.label === right.label
  && left.count === right.count
)

const sameCard = (
  left: GalleryCard | undefined,
  right: GalleryCard | undefined
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.itemId === right.itemId
  && left.recordId === right.recordId
  && equal.sameOrder(left.fields, right.fields)
  && left.size === right.size
  && left.layout === right.layout
  && left.wrap === right.wrap
  && left.canDrag === right.canDrag
  && left.selected === right.selected
  && left.editing === right.editing
)

export const createGalleryModel = (input: {
  source: EngineSource
  selectionMembershipStore: store.KeyedReadStore<ItemId, boolean>
  previewSelectionMembershipStore: store.KeyedReadStore<ItemId, boolean | null>
  inlineEditingStore: store.KeyedReadStore<string, boolean>
  inlineKey: (input: {
    viewId: string
    itemId: ItemId
  }) => string
}): DataViewGalleryModel => {
  const customFields = input.source.active.fields.customList
  const sectionList = input.source.active.sections.list
  const sections = store.createDerivedStore({
    get: () => (
      store.read(input.source.active.view.type) === 'gallery'
        ? store.read(sectionList).all
        : EMPTY_SECTIONS
    ),
    isEqual: equal.sameOrder
  })
  const properties = createRecordCardPropertiesStore({
    source: input.source,
    fields: customFields
  })
  const body = store.createDerivedStore<GalleryBody | null>({
    get: () => {
      if (store.read(input.source.active.view.type) !== 'gallery') {
        return null
      }

      const viewId = store.read(input.source.active.view.id)
      if (!viewId) {
        return null
      }

      const gallery = store.read(input.source.active.gallery)
      return {
        viewId,
        empty: store.read(input.source.active.items.list).count === 0,
        grouped: Boolean(store.read(input.source.active.query).group),
        size: gallery.size,
        canDrag: gallery.canReorder,
        groupUsesOptionColors: gallery.groupUsesOptionColors
      }
    },
    isEqual: sameBody
  })

  const section = store.createKeyedDerivedStore<string, GallerySection | undefined>({
    get: key => {
      if (store.read(input.source.active.view.type) !== 'gallery') {
        return undefined
      }

      const value = store.read(input.source.active.sections, key)
      return value
        ? {
            key: value.key,
            label: value.label,
            count: value.itemIds.length
          }
        : undefined
    },
    isEqual: sameSection
  })

  const card = store.createKeyedDerivedStore<ItemId, GalleryCard | undefined>({
    get: itemId => {
      if (store.read(input.source.active.view.type) !== 'gallery') {
        return undefined
      }

      const viewId = store.read(input.source.active.view.id)
      if (!viewId) {
        return undefined
      }

      const recordId = store.read(input.source.active.items.read.recordId, itemId)
      if (!recordId) {
        return undefined
      }

      const gallery = store.read(input.source.active.gallery)
      return {
        viewId,
        itemId,
        recordId,
        fields: store.read(customFields),
        size: gallery.size,
        layout: gallery.layout,
        wrap: gallery.wrap,
        canDrag: gallery.canReorder,
        selected: (
          store.read(input.previewSelectionMembershipStore, itemId)
          ?? store.read(input.selectionMembershipStore, itemId)
        ),
        editing: store.read(
          input.inlineEditingStore,
          input.inlineKey({
            viewId,
            itemId
          })
        )
      }
    },
    isEqual: sameCard
  })

  const content = createItemCardContentStore({
    source: input.source,
    viewType: 'gallery',
    properties,
    placeholderText: () => DEFAULT_GALLERY_TITLE_PLACEHOLDER
  })

  return {
    body,
    sections,
    section,
    card,
    content
  }
}
