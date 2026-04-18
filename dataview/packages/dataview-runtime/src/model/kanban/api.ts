import type {
  DataRecord,
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  KanbanState,
  SectionKey,
  ViewState
} from '@dataview/engine'
import type {
  DataViewInlineRuntime
} from '@dataview/runtime/model/inline/types'
import type {
  DataViewKanbanModel,
  KanbanBoardBase,
  KanbanCardData,
  KanbanSectionBase
} from '@dataview/runtime/model/kanban/types'
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
  sameOrder,
  sameValue,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import {
  isEmptyFieldValue
} from '@dataview/core/field'

const sameBoardBase = (
  left: KanbanBoardBase | null,
  right: KanbanBoardBase | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.grouped === right.grouped
  && sameOrder(left.sectionKeys, right.sectionKeys)
  && left.groupField === right.groupField
  && left.fillColumnColor === right.fillColumnColor
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
)

const sameSectionBase = (
  left: KanbanSectionBase | undefined,
  right: KanbanSectionBase | undefined
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
  left: KanbanCardData | undefined,
  right: KanbanCardData | undefined
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

export const createKanbanModel = (input: {
  activeStateStore: ReadStore<ViewState | undefined>
  extraStateStore: ReadStore<KanbanState | undefined>
  recordStore: KeyedReadStore<RecordId, DataRecord | undefined>
  selectionMembershipStore: KeyedReadStore<ItemId, boolean>
  previewSelectionMembershipStore: KeyedReadStore<ItemId, boolean | null>
  inline: DataViewInlineRuntime
}): DataViewKanbanModel => {
  const boardBase = createDerivedStore<KanbanBoardBase | null>({
    get: () => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'kanban')
      const extra = read(input.extraStateStore)
      if (!active || !extra) {
        return null
      }

      return {
        viewId: active.view.id,
        grouped: active.query.group.active,
        sectionKeys: active.sections.ids,
        groupField: active.query.group.field,
        fillColumnColor: extra.fillColumnColor,
        groupUsesOptionColors: extra.groupUsesOptionColors,
        cardsPerColumn: extra.cardsPerColumn
      }
    },
    isEqual: sameBoardBase
  })

  const sectionBase = createKeyedDerivedStore<SectionKey, KanbanSectionBase | undefined>({
    keyOf: key => key,
    get: key => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'kanban')
      const current = active?.sections.get(key)
      return current
        ? {
            key: current.key,
            label: current.label,
            bucket: current.bucket,
            collapsed: current.collapsed,
            count: current.items.count,
            color: current.color
          }
        : undefined
    },
    isEqual: sameSectionBase
  })

  const card = createKeyedDerivedStore<ItemId, KanbanCardData | undefined>({
    keyOf: itemId => itemId,
    get: itemId => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'kanban')
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
        ),
        color: extra.groupUsesOptionColors
          ? active.sections.get(item.sectionKey)?.color
          : undefined
      }
    },
    isEqual: sameCard
  })

  const content = createKeyedDerivedStore<ItemId, RecordCardContentData | undefined>({
    keyOf: itemId => itemId,
    get: itemId => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'kanban')
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
        placeholderText: item.recordId,
        properties,
        hasProperties: properties.some(property => !isEmptyFieldValue(property.value))
      }
    },
    isEqual: sameContent
  })

  return {
    boardBase,
    sectionBase,
    card,
    content
  }
}
