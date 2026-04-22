import type {
  Action,
  DataRecord,
  Field,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import { field as fieldApi } from '@dataview/core/field'
import { group as groupCore } from '@dataview/core/group'
import { view as viewApi } from '@dataview/core/view'
import { collection, equal } from '@shared/core'
import type {
  ItemId,
  ItemList,
  MoveTarget
} from '@dataview/engine/contracts/shared'
import type {
  ActiveCellsApi,
  ActiveItemsApi,
  ActiveViewReadApi,
  MovePlan,
  ViewState
} from '@dataview/engine/contracts/view'
import type { ActiveViewContext } from '@dataview/engine/active/api/context'

const createMoveOrderAction = (
  base: ActiveViewContext,
  recordIds: readonly RecordId[],
  beforeRecordId?: RecordId
): Extract<Action, { type: 'view.patch' }> | undefined => {
  const view = base.view()
  const viewId = base.reader.views.activeId()
  if (!view || !viewId || !recordIds.length) {
    return undefined
  }

  return {
    type: 'view.patch',
    viewId,
    patch: {
      orders: viewApi.order.reorder({
        allRecordIds: base.reader.document().records.order,
        currentOrder: view.orders,
        movingRecordIds: recordIds,
        beforeRecordId
      })
    }
  }
}

const createGroupValueActions = (input: {
  readRecord: (recordId: RecordId) => DataRecord | undefined
  group: ViewGroup
  field: Field
  items: ItemList
  itemIds: readonly ItemId[]
  targetSection: string
}): readonly Action[] | undefined => {
  const fieldId = input.group.field
  const itemIdsByRecordId = new Map<RecordId, ItemId[]>()

  input.itemIds.forEach(itemId => {
    const recordId = input.items.read.record(itemId)
    if (!recordId) {
      return
    }

    const ids = itemIdsByRecordId.get(recordId)
    if (ids) {
      ids.push(itemId)
      return
    }

    itemIdsByRecordId.set(recordId, [itemId])
  })

  const actions: Action[] = []

  for (const [recordId, itemIds] of itemIdsByRecordId) {
    const record = input.readRecord(recordId)
    const initialValue = fieldApi.id.isTitle(fieldId)
      ? record?.title
      : record?.values[fieldId]
    let currentValue = initialValue

    for (const itemId of itemIds) {
      const next = groupCore.write.value({
        field: input.field,
        group: input.group,
        currentValue,
        fromKey: input.items.read.section(itemId),
        toKey: input.targetSection
      })
      if (next.kind === 'invalid') {
        return undefined
      }

      currentValue = next.kind === 'clear'
        ? undefined
        : next.value
    }

    if (equal.sameJsonValue(initialValue, currentValue)) {
      continue
    }

    actions.push({
      type: 'record.fields.writeMany',
      input: currentValue === undefined
        ? {
            recordIds: [recordId],
            clear: [fieldId]
          }
        : {
            recordIds: [recordId],
            set: {
              [fieldId]: currentValue
            }
          }
    })
  }

  return actions
}

export const planMove = (
  itemIds: readonly ItemId[],
  target: MoveTarget,
  readState: () => ViewState | undefined
): MovePlan => {
  const state = readState()
  if (!state) {
    return {
      itemIds: [],
      recordIds: [],
      changed: false,
      sectionChanged: false,
      target: {
        section: target.section
      }
    }
  }

  const validIds = itemIds.filter(id => state.items.order.has(id))
  const movingSet = new Set(validIds)
  const section = state.sections.get(target.section)
  const sectionItemIds = section?.itemIds ?? []
  const beforeItemId = target.before && sectionItemIds.includes(target.before)
    ? target.before
    : undefined
  const remaining = sectionItemIds.filter(id => !movingSet.has(id))
  const insertIndex = beforeItemId
    ? remaining.indexOf(beforeItemId)
    : -1
  const nextBeforeItemId = beforeItemId && insertIndex >= 0
    ? remaining[insertIndex]
    : undefined
  const nextSectionItemIds = nextBeforeItemId
    ? [
        ...remaining.slice(0, insertIndex),
        ...validIds,
        ...remaining.slice(insertIndex)
      ]
    : [
        ...remaining,
        ...validIds
      ]
  const recordIds = collection.unique(validIds.flatMap(id => {
    const recordId = state.items.read.record(id)
    return recordId ? [recordId] : []
  }))
  const beforeRecordId = nextBeforeItemId
    ? state.items.read.record(nextBeforeItemId)
    : undefined
  const sectionChanged = validIds.some(id => state.items.read.section(id) !== target.section)
  const changed = validIds.length > 0 && (
    sectionChanged
    || nextSectionItemIds.length !== sectionItemIds.length
    || nextSectionItemIds.some((id, currentIndex) => sectionItemIds[currentIndex] !== id)
  )

  return {
    itemIds: validIds,
    recordIds,
    changed,
    sectionChanged,
    target: {
      section: target.section,
      ...(nextBeforeItemId ? { beforeItemId: nextBeforeItemId } : {}),
      ...(beforeRecordId ? { beforeRecordId } : {})
    }
  }
}

export const createActiveItemsApi = (input: {
  base: ActiveViewContext
  read: ActiveViewReadApi
}): ActiveItemsApi => ({
  planMove: (itemIds, target) => planMove(itemIds, target, input.base.state),
  move: (itemIds, target) => {
    const state = input.base.state()
    if (!state) {
      return
    }

    const groupWrite = state.view.group && state.query.group?.field
      ? {
          group: state.view.group,
          field: state.query.group.field
        }
      : undefined
    const plan = planMove(itemIds, target, input.base.state)
    if (!plan.changed || !plan.itemIds.length || !plan.recordIds.length) {
      return
    }

    if (plan.sectionChanged && state.view.group && !groupWrite) {
      return
    }

    const actions: Action[] = []

    if (plan.sectionChanged && groupWrite) {
      const valueActions = createGroupValueActions({
        readRecord: input.read.record,
        group: groupWrite.group,
        field: groupWrite.field,
        items: state.items,
        itemIds: plan.itemIds,
        targetSection: plan.target.section
      })
      if (!valueActions) {
        return
      }

      actions.push(...valueActions)
    }

    if (!state.view.sort.rules.order.length) {
      const moveAction = createMoveOrderAction(
        input.base,
        plan.recordIds,
        plan.target.beforeRecordId
      )
      if (moveAction) {
        actions.push(moveAction)
      }
    }

    if (actions.length) {
      input.base.dispatch(actions)
    }
  },
  remove: itemIds => {
    const state = input.base.state()
    if (!state) {
      return
    }

    const recordIds = itemIds.flatMap(itemId => {
      const recordId = state.items.read.record(itemId)
      return recordId ? [recordId] : []
    }).filter((recordId, index, source) => source.indexOf(recordId) === index)
    if (!recordIds.length) {
      return
    }

    input.base.dispatch({
      type: 'record.remove',
      recordIds: [...recordIds]
    })
  }
})

export const createCellsApi = (input: {
  base: ActiveViewContext
  read: ActiveViewReadApi
}): ActiveCellsApi => ({
  set: (cell, value) => {
    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.dispatch({
      type: 'record.fields.writeMany',
      input: {
        recordIds: [target.recordId],
        set: {
          [target.fieldId]: value
        }
      }
    })
  },
  clear: cell => {
    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.dispatch({
      type: 'record.fields.writeMany',
      input: {
        recordIds: [target.recordId],
        clear: [target.fieldId]
      }
    })
  }
})
