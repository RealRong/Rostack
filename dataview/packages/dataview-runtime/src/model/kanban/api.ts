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
  DataViewKanbanModel,
  KanbanBoard,
  KanbanCard,
  KanbanSection
} from '@dataview/runtime/model/kanban/types'

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
  && sameIdOrder(left.fields, right.fields)
  && left.size === right.size
  && left.layout === right.layout
  && left.wrap === right.wrap
  && left.canDrag === right.canDrag
  && left.selected === right.selected
  && left.editing === right.editing
  && left.color === right.color
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

export const createKanbanModel = (input: {
  source: DataViewSource
  inlineKey: (input: {
    viewId: string
    itemId: number
  }) => string
}): DataViewKanbanModel => {
  const board = createDerivedStore<KanbanBoard | null>({
    get: () => {
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'kanban') {
        return null
      }

      return {
        viewId: view.id,
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
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'kanban') {
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
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'kanban') {
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
            viewId: view.id,
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

  const content = createKeyedDerivedStore<number, CardContent | undefined>({
    get: itemId => {
      const view = read(input.source.active.view.current)
      if (!view || view.type !== 'kanban') {
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
        placeholderText: item.recordId,
        properties,
        hasProperties: properties.some(property => !isEmptyFieldValue(property.value))
      }
    },
    isEqual: sameContent
  })

  return {
    board,
    section,
    card,
    content
  }
}
