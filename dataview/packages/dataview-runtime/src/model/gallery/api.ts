import {
  isEmptyFieldValue
} from '@dataview/core/field'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  sameIdOrder,
  sameOrder,
  sameValue
} from '@shared/core'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  CardContent,
  CardProperty
} from '@dataview/runtime/model/shared'
import type {
  DataViewGalleryModel,
  GalleryBody,
  GalleryCard,
  GallerySection
} from '@dataview/runtime/model/gallery/types'

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
  && sameIdOrder(left.fields, right.fields)
  && left.size === right.size
  && left.layout === right.layout
  && left.wrap === right.wrap
  && left.canDrag === right.canDrag
  && left.selected === right.selected
  && left.editing === right.editing
)

const sameProperty = (
  left: CardProperty,
  right: CardProperty
) => left.field.id === right.field.id
  && sameValue(left.value, right.value)

const sameContent = (
  left: CardContent | undefined,
  right: CardContent | undefined
) => left === right || (
  !!left
  && !!right
  && left.titleText === right.titleText
  && left.placeholderText === right.placeholderText
  && left.hasProperties === right.hasProperties
  && sameOrder(left.properties, right.properties, sameProperty)
)

export const createGalleryModel = (input: {
  source: DataViewSource
  inlineKey: (input: {
    viewId: string
    itemId: number
  }) => string
}): DataViewGalleryModel => {
  const body = createDerivedStore<GalleryBody | null>({
    get: () => {
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'gallery') {
        return null
      }

      return {
        viewId: view.id,
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
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'gallery') {
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
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'gallery') {
        return undefined
      }

      const item = read(input.source.active.items, itemId)
      if (!item) {
        return undefined
      }

      return {
        viewId: view.id,
        itemId,
        recordId: item.recordId,
        fields: read(input.source.active.fields.custom.ids)
          .flatMap(fieldId => {
            const field = read(input.source.active.fields.custom, fieldId)
            return field ? [field] : []
          }),
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
            viewId: view.id,
            itemId
          })
        )
      }
    },
    isEqual: sameCard
  })

  const content = createKeyedDerivedStore<number, CardContent | undefined>({
    get: itemId => {
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'gallery') {
        return undefined
      }

      const item = read(input.source.active.items, itemId)
      const record = item
        ? read(input.source.doc.records, item.recordId)
        : undefined
      if (!item || !record) {
        return undefined
      }

      const properties = read(input.source.active.fields.custom.ids)
        .flatMap(fieldId => {
          const field = read(input.source.active.fields.custom, fieldId)
          return field
            ? [{
                field,
                value: record.values[field.id]
              }]
            : []
        })

      return {
        titleText: record.title,
        placeholderText: DEFAULT_GALLERY_TITLE_PLACEHOLDER,
        properties,
        hasProperties: properties.some(property => !isEmptyFieldValue(property.value))
      }
    },
    isEqual: sameContent
  })

  return {
    body,
    section,
    card,
    content
  }
}
