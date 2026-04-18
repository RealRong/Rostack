import type {
  DataRecord,
  RecordId
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine'
import type {
  GalleryState,
  ItemId,
  SectionKey
} from '@dataview/engine'
import type {
  DataViewInlineRuntime
} from '@dataview/runtime/model/inline/types'
import type {
  DataViewGalleryModel,
  GalleryBodyBase,
  GalleryCardData,
  GallerySectionData
} from '@dataview/runtime/model/gallery/types'
import {
  readActiveTypedViewState,
  type RecordCardContentData,
  type RecordCardPropertyData
} from '@dataview/runtime/model/shared'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  sameIdOrder,
  sameMap,
  sameOrder,
  sameValue,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import {
  isEmptyFieldValue
} from '@dataview/core/field'

const DEFAULT_GALLERY_TITLE_PLACEHOLDER = '输入名称...'

const sameBodyBase = (
  left: GalleryBodyBase | null,
  right: GalleryBodyBase | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.empty === right.empty
  && left.grouped === right.grouped
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && sameMap(left.sectionCountByKey, right.sectionCountByKey)
)

const sameSection = (
  left: GallerySectionData | undefined,
  right: GallerySectionData | undefined
) => left === right || (
  !!left
  && !!right
  && left.key === right.key
  && left.label === right.label
  && left.count === right.count
)

const sameCard = (
  left: GalleryCardData | undefined,
  right: GalleryCardData | undefined
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
  left: RecordCardPropertyData,
  right: RecordCardPropertyData
) => left.field.id === right.field.id
  && sameValue(left.value, right.value)

const sameContent = (
  left: RecordCardContentData | undefined,
  right: RecordCardContentData | undefined
) => left === right || (
  !!left
  && !!right
  && left.titleText === right.titleText
  && left.placeholderText === right.placeholderText
  && left.hasProperties === right.hasProperties
  && sameOrder(left.properties, right.properties, sameProperty)
)

export const createGalleryModel = (input: {
  activeStateStore: ReadStore<ViewState | undefined>
  extraStateStore: ReadStore<GalleryState | undefined>
  recordStore: KeyedReadStore<RecordId, DataRecord | undefined>
  selectionMembershipStore: KeyedReadStore<ItemId, boolean>
  previewSelectionMembershipStore: KeyedReadStore<ItemId, boolean | null>
  inline: DataViewInlineRuntime
}): DataViewGalleryModel => {
  const bodyBase = createDerivedStore<GalleryBodyBase | null>({
    get: () => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'gallery')
      const extra = read(input.extraStateStore)
      if (!active || !extra) {
        return null
      }

      return {
        viewId: active.view.id,
        empty: active.items.count === 0,
        grouped: active.query.group.active,
        groupUsesOptionColors: extra.groupUsesOptionColors,
        sectionCountByKey: new Map(
          active.sections.all.map(section => [section.key, section.items.count] as const)
        )
      }
    },
    isEqual: sameBodyBase
  })

  const section = createKeyedDerivedStore<SectionKey, GallerySectionData | undefined>({
    keyOf: key => key,
    get: key => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'gallery')
      const value = active?.sections.get(key)
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

  const card = createKeyedDerivedStore<ItemId, GalleryCardData | undefined>({
    keyOf: itemId => itemId,
    get: itemId => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'gallery')
      const extra = read(input.extraStateStore)
      const item = active?.items.get(itemId)
      if (!active || !extra || !item) {
        return undefined
      }

      return {
        viewId: active.view.id,
        itemId,
        recordId: item.recordId,
        fields: active.fields.custom,
        size: extra.card.size,
        layout: extra.card.layout,
        wrap: extra.card.wrap,
        canDrag: extra.canReorder,
        selected: (
          read(input.previewSelectionMembershipStore, itemId)
          ?? read(input.selectionMembershipStore, itemId)
        ),
        editing: read(
          input.inline.editing,
          input.inline.key({
            viewId: active.view.id,
            itemId
          })
        )
      }
    },
    isEqual: sameCard
  })

  const content = createKeyedDerivedStore<ItemId, RecordCardContentData | undefined>({
    keyOf: itemId => itemId,
    get: itemId => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'gallery')
      const item = active?.items.get(itemId)
      const record = item
        ? read(input.recordStore, item.recordId)
        : undefined
      if (!active || !item || !record) {
        return undefined
      }

      const properties = active.fields.custom.map(field => ({
        field,
        value: record.values[field.id]
      }))

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
    bodyBase,
    section,
    card,
    content
  }
}
