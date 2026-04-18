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
  readActiveTypedViewState
} from '@dataview/runtime/model/shared'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  sameIdOrder,
  sameMap,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'

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
  && sameIdOrder(left.fields, right.fields)
  && left.size === right.size
  && left.layout === right.layout
  && left.wrap === right.wrap
  && left.canDrag === right.canDrag
  && left.selected === right.selected
  && left.editing === right.editing
)

export const createGalleryModel = (input: {
  activeStateStore: ReadStore<ViewState | undefined>
  extraStateStore: ReadStore<GalleryState | undefined>
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
      if (!active || !extra || !active.items.has(itemId)) {
        return undefined
      }

      return {
        viewId: active.view.id,
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

  return {
    bodyBase,
    section,
    card
  }
}
