import { equal, store } from '@shared/core'
import {
  type ItemId,
  queryRead
} from '@dataview/engine'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  DataViewKanbanModel,
  KanbanBoard,
  KanbanCard,
  KanbanSection
} from '@dataview/runtime/model/kanban/types'
import {
  createActiveCustomFieldListStore,
  createItemCardContentStore,
  createRecordCardPropertiesStore
} from '@dataview/runtime/model/internal/card'

const sameBoard = (
  left: KanbanBoard | null,
  right: KanbanBoard | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.grouped === right.grouped
  && left.sectionKeys === right.sectionKeys
  && left.groupField === right.groupField
  && left.fillColumnColor === right.fillColumnColor
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
)

const sameSection = (
  left: KanbanSection | undefined,
  right: KanbanSection | undefined
) => left === right || (
  !!left
  && !!right
  && left.key === right.key
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
  && equal.sameOrder(left.fields, right.fields)
  && left.size === right.size
  && left.layout === right.layout
  && left.wrap === right.wrap
  && left.canDrag === right.canDrag
  && left.selected === right.selected
  && left.editing === right.editing
  && left.color === right.color
)

export const createKanbanModel = (input: {
  source: DataViewSource
  inlineKey: (input: {
    viewId: string
    itemId: ItemId
  }) => string
}): DataViewKanbanModel => {
  const customFields = createActiveCustomFieldListStore(input.source)
  const properties = createRecordCardPropertiesStore({
    source: input.source,
    fields: customFields
  })
  const board = store.createDerivedStore<KanbanBoard | null>({
    get: () => {
      if (store.read(input.source.active.view.type) !== 'kanban') {
        return null
      }

      const viewId = store.read(input.source.active.view.id)
      if (!viewId) {
        return null
      }

      return {
        viewId,
        grouped: queryRead.grouped(store.read(input.source.active.meta.query)),
        sectionKeys: store.read(input.source.active.sections.keys),
        groupField: store.read(input.source.active.meta.query).group.field,
        fillColumnColor: store.read(input.source.active.meta.kanban).fillColumnColor,
        groupUsesOptionColors: store.read(input.source.active.meta.kanban).groupUsesOptionColors,
        cardsPerColumn: store.read(input.source.active.meta.kanban).cardsPerColumn
      }
    },
    isEqual: sameBoard
  })

  const section = store.createKeyedDerivedStore<string, KanbanSection | undefined>({
    get: key => {
      if (store.read(input.source.active.view.type) !== 'kanban') {
        return undefined
      }

      const value = store.read(input.source.active.sections, key)
      return value
        ? {
            key: value.key,
            label: value.label,
            bucket: value.bucket,
            collapsed: value.collapsed,
            count: value.items.count,
            color: value.color
          }
        : undefined
    },
    isEqual: sameSection
  })

  const card = store.createKeyedDerivedStore<ItemId, KanbanCard | undefined>({
    get: itemId => {
      if (store.read(input.source.active.view.type) !== 'kanban') {
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

      const kanban = store.read(input.source.active.meta.kanban)
      return {
        viewId,
        itemId,
        recordId: item.recordId,
        fields: store.read(customFields),
        size: kanban.size,
        layout: kanban.layout,
        wrap: kanban.wrap,
        canDrag: kanban.canReorder,
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
        ),
        color: kanban.groupUsesOptionColors
          ? store.read(input.source.active.sections, item.sectionKey)?.color
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
    section,
    card,
    content
  }
}
