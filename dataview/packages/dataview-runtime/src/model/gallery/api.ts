import { equal, store } from '@shared/core'
import {
  queryRead
} from '@dataview/engine'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  DataViewGalleryModel,
  GalleryBody,
  GalleryCard,
  GallerySection
} from '@dataview/runtime/model/gallery/types'
import {
  createActiveCustomFieldListStore,
  createItemCardContentStore,
  createRecordCardPropertiesStore
} from '@dataview/runtime/model/internal/card'

const DEFAULT_GALLERY_TITLE_PLACEHOLDER = '输入名称...'

const sameBody = (
  left: GalleryBody | null,
  right: GalleryBody | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.empty === right.empty
  && left.grouped === right.grouped
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.sectionKeys === right.sectionKeys
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
  source: DataViewSource
  inlineKey: (input: {
    viewId: string
    itemId: number
  }) => string
}): DataViewGalleryModel => {
  const customFields = createActiveCustomFieldListStore(input.source)
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

      return {
        viewId,
        empty: store.read(input.source.active.items.ids).length === 0,
        grouped: queryRead.grouped(store.read(input.source.active.query)),
        groupUsesOptionColors: store.read(input.source.active.gallery).groupUsesOptionColors,
        sectionKeys: store.read(input.source.active.sections.keys)
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
            count: value.items.count
          }
        : undefined
    },
    isEqual: sameSection
  })

  const card = store.createKeyedDerivedStore<number, GalleryCard | undefined>({
    get: itemId => {
      if (store.read(input.source.active.view.type) !== 'gallery') {
        return undefined
      }

      const viewId = store.read(input.source.active.view.id)
      if (!viewId) {
        return undefined
      }

      const item = store.read(input.source.active.items, itemId)
      if (!item) {
        return undefined
      }

      const gallery = store.read(input.source.active.gallery)
      return {
        viewId,
        itemId,
        recordId: item.recordId,
        fields: store.read(customFields),
        size: gallery.size,
        layout: gallery.layout,
        wrap: gallery.wrap,
        canDrag: gallery.canReorder,
        selected: (
          store.read(input.source.selection.preview, itemId)
          ?? store.read(input.source.selection.member, itemId)
        ),
        editing: store.read(
          input.source.inline.editing,
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
    section,
    card,
    content
  }
}
