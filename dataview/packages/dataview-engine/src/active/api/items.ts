import type {
  DataRecord,
  Field,
  Intent as CoreIntent,
  RecordId,
  ViewGroup
} from '@dataview/core/types'
import { field as fieldApi } from '@dataview/core/field'
import { group as groupCore } from '@dataview/core/view'
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
): Extract<CoreIntent, { type: 'view.order.move' | 'view.order.splice' }> | undefined => {
  const view = base.view()
  const viewId = base.reader.views.activeId()
  if (!view || !viewId || !recordIds.length) {
    return undefined
  }

  return recordIds.length === 1
    ? {
        type: 'view.order.move',
        id: viewId,
        record: recordIds[0]!,
        ...(beforeRecordId !== undefined
          ? { before: beforeRecordId }
          : {})
      }
    : {
        type: 'view.order.splice',
        id: viewId,
        records: [...recordIds],
        ...(beforeRecordId !== undefined
          ? { before: beforeRecordId }
          : {})
      }
}

const createGroupValueActions = (input: {
  readRecord: (recordId: RecordId) => DataRecord | undefined
  group: ViewGroup
  field: Field
  items: ItemList
  itemIds: readonly ItemId[]
  targetBucketId: string
}): readonly CoreIntent[] | undefined => {
  const fieldId = input.group.fieldId
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

  const actions: CoreIntent[] = []

  for (const [recordId, itemIds] of itemIdsByRecordId) {
    const record = input.readRecord(recordId)
    const initialValue = fieldApi.id.isTitle(fieldId)
      ? record?.title
      : record?.values[fieldId]
    let currentValue = initialValue

    for (const itemId of itemIds) {
      const next = groupCore.record.writeValue({
        field: input.field,
        group: input.group,
        currentValue,
        fromBucketId: input.items.read.section(itemId),
        bucketId: input.targetBucketId
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
      ...(currentValue === undefined
        ? {
            recordIds: [recordId],
            clear: [fieldId]
          }
        : {
            recordIds: [recordId],
            set: {
              [fieldId]: currentValue
            }
          })
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
      ...(nextBeforeItemId ? { before: nextBeforeItemId } : {}),
      ...(beforeRecordId ? { beforeRecord: beforeRecordId } : {})
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

    const actions: CoreIntent[] = []

    if (plan.sectionChanged && groupWrite) {
      const targetBucketId = state.sections.get(plan.target.section)?.bucket?.id
      if (!targetBucketId) {
        return
      }

      const valueActions = createGroupValueActions({
        readRecord: input.read.record,
        group: groupWrite.group,
        field: groupWrite.field,
        items: state.items,
        itemIds: plan.itemIds,
        targetBucketId
      })
      if (!valueActions) {
        return
      }

      actions.push(...valueActions)
    }

    if (!state.view.sort.rules.length) {
      const moveAction = createMoveOrderAction(
        input.base,
        plan.recordIds,
        plan.target.beforeRecord
      )
      if (moveAction) {
        actions.push(moveAction)
      }
    }

    if (actions.length) {
      input.base.execute(actions)
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

    input.base.execute({
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

    input.base.execute({
      type: 'record.fields.writeMany',
      recordIds: [target.recordId],
      set: {
        [target.fieldId]: value
      }
    })
  },
  clear: cell => {
    const target = input.read.cell(cell)
    if (!target) {
      return
    }

    input.base.execute({
      type: 'record.fields.writeMany',
      recordIds: [target.recordId],
      clear: [target.fieldId]
    })
  }
})
