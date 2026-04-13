import type {
  Action,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import { isTitleFieldId } from '@dataview/core/field'
import { group as groupCore } from '@dataview/core/group'
import { trimToUndefined, unique } from '@shared/core'
import { createRecordId } from '../../mutate/entityId'
import type {
  ActiveItemsApi,
  ActiveViewReadApi,
  MovePlan,
  Placement
} from '../../contracts/public'
import { createGroupValueActions, type ActiveViewContext } from '../context'

export const planMove = (
  itemIds: readonly string[],
  target: Placement,
  readState: () => import('../../contracts/public').ViewState | undefined
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

  const validIds = itemIds.filter(id => state.items.has(id))
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
  const recordIds = unique(validIds.flatMap(id => {
    const recordId = state.items.get(id)?.recordId
    return recordId ? [recordId] : []
  }))
  const beforeRecordId = nextBeforeItemId
    ? state.items.get(nextBeforeItemId)?.recordId
    : undefined
  const sectionChanged = validIds.some(id => state.items.get(id)?.sectionKey !== target.section)
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
  planMove: (itemIds, target) => planMove(itemIds, target, input.base.readState),
  move: (itemIds, target) => {
    const state = input.base.readState()
    if (!state) {
      return
    }

    const groupWrite = state.query.group.group && state.query.group.field
      ? {
          group: state.query.group.group,
          field: state.query.group.field
        }
      : undefined
    const plan = planMove(itemIds, target, input.base.readState)
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

    if (!state.view.sort.length) {
      const moveAction = input.base.createMoveOrderAction(
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
  create: createInput => {
    const state = input.base.readState()
    if (!state) {
      return undefined
    }

    const groupWrite = state.query.group.group && state.query.group.field
      ? {
          group: state.query.group.group,
          field: state.query.group.field
        }
      : undefined
    if (state.view.group && !groupWrite) {
      return undefined
    }

    const values: Partial<Record<FieldId, unknown>> = {
      ...(createInput.values ?? {})
    }
    let title = trimToUndefined(createInput.title)

    if (groupWrite) {
      const fieldId = groupWrite.group.field
      const next = groupCore.write.next({
        field: groupWrite.field,
        group: groupWrite.group,
        currentValue: isTitleFieldId(fieldId)
          ? title
          : values[fieldId],
        toKey: createInput.section
      })
      if (next.kind === 'invalid') {
        return undefined
      }

      if (isTitleFieldId(fieldId)) {
        title = next.kind === 'clear'
          ? ''
          : String(next.value ?? '')
      } else if (next.kind === 'clear') {
        delete values[fieldId]
      } else {
        values[fieldId] = next.value
      }
    }

    const recordId = createRecordId()
    const actions: Action[] = [{
      type: 'record.create',
      input: {
        id: recordId,
        ...(title ? { title } : {}),
        values
      }
    }]

    if (
      state.view.type === 'kanban'
      && state.view.options.kanban.newRecordPosition === 'start'
      && !state.view.sort.length
    ) {
      const beforeRecordId = state.sections.get(createInput.section)?.recordIds[0]
      const moveAction = input.base.createMoveOrderAction([recordId], beforeRecordId)
      if (moveAction) {
        actions.push(moveAction)
      }
    }

    const result = input.base.dispatch(actions)
    return result.applied
      ? recordId
      : undefined
  },
  remove: itemIds => {
    const state = input.base.readState()
    if (!state) {
      return
    }

    const recordIds = itemIds.flatMap(itemId => {
      const recordId = state.items.get(itemId)?.recordId
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
