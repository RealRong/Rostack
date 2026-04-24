import { equal, store } from '@shared/core'
import {
  type ItemId
} from '@dataview/engine'
import type {
  KanbanModel,
  KanbanBoard,
  KanbanCard,
  KanbanSection
} from '@dataview/runtime/model/kanban/types'
import {
  createItemCardContentStore,
  createRecordCardPropertiesStore
} from '@dataview/runtime/model/card'
import type {
  EngineSource
} from '@dataview/runtime/source'

const EMPTY_SECTIONS = [] as const

const sameBoard = (
  left: KanbanBoard | null,
  right: KanbanBoard | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.grouped === right.grouped
  && left.groupField === right.groupField
  && left.fillColumnColor === right.fillColumnColor
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
  && left.size === right.size
  && left.canDrag === right.canDrag
)

const sameSection = (
  left: KanbanSection | undefined,
  right: KanbanSection | undefined
) => left === right || (
  !!left
  && !!right
  && left.id === right.id
  && left.label === right.label
  && left.bucket === right.bucket
  && left.collapsed === right.collapsed
  && left.count === right.count
  && left.color === right.color
)

const sameCard = (
  left: KanbanCard | undefined,
  right: KanbanCard | undefined
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.itemId === right.itemId
  && left.recordId === right.recordId
  && equal.sameOrder(left.propertyFields, right.propertyFields)
  && left.size === right.size
  && left.layout === right.layout
  && left.wrap === right.wrap
  && left.canDrag === right.canDrag
  && left.selected === right.selected
  && left.editing === right.editing
  && left.color === right.color
)

export const createKanbanModel = (input: {
  source: EngineSource
  selectionMembershipStore: store.KeyedReadStore<ItemId, boolean>
  previewSelectionMembershipStore: store.KeyedReadStore<ItemId, boolean | null>
  inlineEditingStore: store.KeyedReadStore<string, boolean>
  inlineKey: (input: {
    viewId: string
    itemId: ItemId
  }) => string
}): KanbanModel => {
  const customFields = input.source.active.fields.customList
  const sectionList = input.source.active.sections.list
  const sections = store.createDerivedStore({
    get: () => (
      store.read(input.source.active.viewType) === 'kanban'
        ? store.read(sectionList).all
        : EMPTY_SECTIONS
    ),
    isEqual: equal.sameOrder
  })
  const properties = createRecordCardPropertiesStore({
    source: input.source,
    propertyFields: customFields
  })
  const board = store.createDerivedStore<KanbanBoard | null>({
    get: () => {
      if (store.read(input.source.active.viewType) !== 'kanban') {
        return null
      }

      const viewId = store.read(input.source.active.viewId)
      if (!viewId) {
        return null
      }

      const kanban = store.read(input.source.active.kanban)
      const query = store.read(input.source.active.query)
      return {
        viewId,
        grouped: Boolean(query.group),
        groupField: query.group?.field,
        fillColumnColor: kanban.fillColumnColor,
        groupUsesOptionColors: kanban.groupUsesOptionColors,
        cardsPerColumn: kanban.cardsPerColumn,
        size: kanban.size,
        canDrag: kanban.canReorder
      }
    },
    isEqual: sameBoard
  })

  const section = store.createKeyedDerivedStore<string, KanbanSection | undefined>({
    get: key => {
      if (store.read(input.source.active.viewType) !== 'kanban') {
        return undefined
      }

      const value = store.read(input.source.active.sections, key)
      return value
        ? {
            id: value.id,
            label: value.label,
            bucket: value.bucket,
            collapsed: value.collapsed,
            count: value.itemIds.length,
            color: value.color
          }
        : undefined
    },
    isEqual: sameSection
  })

  const card = store.createKeyedDerivedStore<ItemId, KanbanCard | undefined>({
    get: itemId => {
      if (store.read(input.source.active.viewType) !== 'kanban') {
        return undefined
      }

      const viewId = store.read(input.source.active.viewId)
      if (!viewId) {
        return undefined
      }

      const placement = store.read(input.source.active.items.read.placement, itemId)
      if (!placement) {
        return undefined
      }

      const kanban = store.read(input.source.active.kanban)
      return {
        viewId,
        itemId,
        recordId: placement.recordId,
        propertyFields: store.read(customFields),
        size: kanban.size,
        layout: kanban.layout,
        wrap: kanban.wrap,
        canDrag: kanban.canReorder,
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
        ),
        color: kanban.groupUsesOptionColors
          ? store.read(input.source.active.sections, placement.sectionId)?.color
          : undefined
      }
    },
    isEqual: sameCard
  })

  const content = createItemCardContentStore({
    source: input.source,
    viewType: 'kanban',
    properties,
    placeholderText: ({ item }) => item.recordId
  })

  return {
    board,
    sections,
    section,
    card,
    content
  }
}
