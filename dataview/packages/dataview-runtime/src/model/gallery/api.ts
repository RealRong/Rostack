import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  sameOrder
} from '@shared/core'
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
  && sameOrder(left.fields, right.fields)
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
  const body = createDerivedStore<GalleryBody | null>({
    get: () => {
      if (read(input.source.active.view.type) !== 'gallery') {
        return null
      }

      const viewId = read(input.source.active.view.id)
      if (!viewId) {
        return null
      }

      return {
        viewId,
        empty: read(input.source.active.items.ids).length === 0,
        grouped: read(input.source.active.query.grouped),
        groupUsesOptionColors: read(input.source.active.gallery.groupUsesOptionColors),
        sectionKeys: read(input.source.active.sections.keys)
      }
    },
    isEqual: sameBody
  })

  const section = createKeyedDerivedStore<string, GallerySection | undefined>({
    get: key => {
      if (read(input.source.active.view.type) !== 'gallery') {
        return undefined
      }

      const value = read(input.source.active.sections, key)
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

  const card = createKeyedDerivedStore<number, GalleryCard | undefined>({
    get: itemId => {
      if (read(input.source.active.view.type) !== 'gallery') {
        return undefined
      }

      const viewId = read(input.source.active.view.id)
      if (!viewId) {
        return undefined
      }

      const item = read(input.source.active.items, itemId)
      if (!item) {
        return undefined
      }

      return {
        viewId,
        itemId,
        recordId: item.recordId,
        fields: read(customFields),
        size: read(input.source.active.gallery.size),
        layout: read(input.source.active.gallery.layout),
        wrap: read(input.source.active.gallery.wrap),
        canDrag: read(input.source.active.gallery.canReorder),
        selected: (
          read(input.source.selection.preview, itemId)
          ?? read(input.source.selection.member, itemId)
        ),
        editing: read(
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
