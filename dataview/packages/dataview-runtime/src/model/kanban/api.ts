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
  && sameOrder(left.fields, right.fields)
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
    itemId: number
  }) => string
}): DataViewKanbanModel => {
  const customFields = createActiveCustomFieldListStore(input.source)
  const properties = createRecordCardPropertiesStore({
    source: input.source,
    fields: customFields
  })
  const board = createDerivedStore<KanbanBoard | null>({
    get: () => {
      if (read(input.source.active.view.type) !== 'kanban') {
        return null
      }

      const viewId = read(input.source.active.view.id)
      if (!viewId) {
        return null
      }

      return {
        viewId,
        grouped: read(input.source.active.query.grouped),
        sectionKeys: read(input.source.active.sections.keys),
        groupField: read(input.source.active.query.group).field,
        fillColumnColor: read(input.source.active.kanban.fillColumnColor),
        groupUsesOptionColors: read(input.source.active.kanban.groupUsesOptionColors),
        cardsPerColumn: read(input.source.active.kanban.cardsPerColumn)
      }
    },
    isEqual: sameBoard
  })

  const section = createKeyedDerivedStore<string, KanbanSection | undefined>({
    get: key => {
      if (read(input.source.active.view.type) !== 'kanban') {
        return undefined
      }

      const value = read(input.source.active.sections, key)
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

  const card = createKeyedDerivedStore<number, KanbanCard | undefined>({
    get: itemId => {
      if (read(input.source.active.view.type) !== 'kanban') {
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
        size: read(input.source.active.kanban.size),
        layout: read(input.source.active.kanban.layout),
        wrap: read(input.source.active.kanban.wrap),
        canDrag: read(input.source.active.kanban.canReorder),
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
        ),
        color: read(input.source.active.kanban.groupUsesOptionColors)
          ? read(input.source.active.sections, item.sectionKey)?.color
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
