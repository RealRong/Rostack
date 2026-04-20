import type {
  Action,
  Field,
  FieldId,
  FilterRule,
  RecordId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  isTitleFieldId,
  readDateComparableTimestamp
} from '@dataview/core/field'
import {
  matchFilterRule,
  readFilterOptionSetValue
} from '@dataview/core/filter'
import {
  group as groupCore
} from '@dataview/core/group'
import {
  reorderViewOrders
} from '@dataview/core/view'
import { sameJsonValue } from '@shared/core'
import {
  createRecordId
} from '@dataview/engine/mutate/entityId'
import type {
  ActiveRecordsApi,
  ViewState
} from '@dataview/engine/contracts/public'
import type {
  ActiveViewContext
} from '@dataview/engine/active/context'

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

  const allRecordIds = [
    ...base.reader.document().records.order,
    ...recordIds.filter(recordId => !base.reader.records.has(recordId))
  ]

  return {
    type: 'view.patch',
    viewId,
    patch: {
      orders: reorderViewOrders({
        allRecordIds,
        currentOrder: view.orders,
        movingRecordIds: recordIds,
        beforeRecordId
      })
    }
  }
}

interface CreateDraftState {
  title?: string
  values: Partial<Record<FieldId, unknown>>
  clearFieldIds: Set<FieldId>
}

const createDraftState = (
  set?: Partial<Record<FieldId, unknown>>,
  hasField?: (fieldId: FieldId) => boolean
): CreateDraftState | undefined => {
  const values: Partial<Record<FieldId, unknown>> = {}
  let title: string | undefined

  for (const [fieldId, value] of Object.entries(set ?? {}) as [FieldId, unknown][]) {
    if (fieldId !== TITLE_FIELD_ID && !hasField?.(fieldId)) {
      return undefined
    }
    if (value === undefined) {
      continue
    }

    if (isTitleFieldId(fieldId)) {
      title = String(value ?? '')
      continue
    }

    values[fieldId] = value
  }

  return {
    title,
    values,
    clearFieldIds: new Set<FieldId>()
  }
}

const readDraftValue = (
  draft: CreateDraftState,
  fieldId: FieldId
) => (
  isTitleFieldId(fieldId)
    ? draft.title
    : draft.values[fieldId]
)

const writeDraftValue = (
  draft: CreateDraftState,
  fieldId: FieldId,
  value: unknown
) => {
  draft.clearFieldIds.delete(fieldId)
  if (isTitleFieldId(fieldId)) {
    draft.title = String(value ?? '')
    return
  }

  draft.values[fieldId] = value
}

const resolveCreateContext = (input: {
  state: ViewState
  sectionKey?: string
  before?: number
}) => {
  const beforeItem = input.before === undefined
    ? undefined
    : input.state.items.get(input.before)
  if (input.before !== undefined && !beforeItem) {
    return undefined
  }

  const nextSectionKey = input.sectionKey
    ?? beforeItem?.sectionKey
    ?? (!input.state.view.group
      ? input.state.sections.ids[0]
      : undefined)
  if (!nextSectionKey) {
    return undefined
  }

  if (beforeItem && beforeItem.sectionKey !== nextSectionKey) {
    return undefined
  }

  const section = input.state.sections.get(nextSectionKey)
  if (!section) {
    return undefined
  }

  if (beforeItem && !section.items.has(beforeItem.id)) {
    return undefined
  }

  return {
    sectionKey: nextSectionKey,
    beforeRecordId: beforeItem?.recordId
  }
}

const resolveFilterRuleDefault = (input: {
  field: Field
  rule: FilterRule
}): {
  fieldId: FieldId
  value: unknown
} | undefined => {
  switch (input.field.kind) {
    case 'title':
      return input.rule.presetId === 'eq' && typeof input.rule.value === 'string'
        ? {
            fieldId: TITLE_FIELD_ID,
            value: input.rule.value
          }
        : undefined
    case 'text':
      return input.rule.presetId === 'eq' && typeof input.rule.value === 'string'
        ? {
            fieldId: input.field.id,
            value: input.rule.value
          }
        : undefined
    case 'number':
      return input.rule.presetId === 'eq'
        && typeof input.rule.value === 'number'
        && Number.isFinite(input.rule.value)
        ? {
            fieldId: input.field.id,
            value: input.rule.value
          }
        : undefined
    case 'date':
      return input.rule.presetId === 'eq'
        && readDateComparableTimestamp(input.rule.value) !== undefined
        ? {
            fieldId: input.field.id,
            value: structuredClone(input.rule.value)
          }
        : undefined
    case 'select':
    case 'status': {
      if (input.rule.presetId !== 'eq') {
        return undefined
      }

      const optionIds = readFilterOptionSetValue(input.rule.value).optionIds
      return optionIds.length
        ? {
            fieldId: input.field.id,
            value: optionIds[0]
          }
        : undefined
    }
    case 'boolean':
      return input.rule.presetId === 'checked'
        ? {
            fieldId: input.field.id,
            value: true
          }
        : input.rule.presetId === 'unchecked'
          ? {
              fieldId: input.field.id,
              value: false
            }
          : undefined
    case 'multiSelect': {
      if (input.rule.presetId !== 'contains') {
        return undefined
      }

      const optionIds = readFilterOptionSetValue(input.rule.value).optionIds
      return optionIds.length
        ? {
            fieldId: input.field.id,
            value: [...optionIds]
          }
        : undefined
    }
    default:
      return undefined
  }
}

const applyFilterDefaults = (input: {
  state: ViewState
  draft: CreateDraftState
}): boolean => {
  const effectiveRules = input.state.query.filters.rules.filter(
    (rule: ViewState['query']['filters']['rules'][number]) => rule.effective
  )
  if (!effectiveRules.length) {
    return true
  }

  if (input.state.view.filter.mode !== 'and') {
    return false
  }

  const derived = new Map<FieldId, unknown>()

  for (const projection of effectiveRules) {
    const field = projection.field
    if (!field) {
      return false
    }

    const fieldId = field.id
    const currentValue = readDraftValue(input.draft, fieldId)
    if (matchFilterRule(field, currentValue, projection.rule)) {
      continue
    }
    if (currentValue !== undefined) {
      return false
    }

    const next = resolveFilterRuleDefault({
      field,
      rule: projection.rule
    })
    if (!next) {
      return false
    }
    const current = derived.get(next.fieldId)
    if (current !== undefined && !sameJsonValue(current, next.value)) {
      return false
    }

    derived.set(next.fieldId, next.value)
  }

  derived.forEach((value, fieldId) => {
    writeDraftValue(input.draft, fieldId, value)
  })

  return true
}

const applyGroupDefault = (input: {
  state: ViewState
  draft: CreateDraftState
  sectionKey: string
}): boolean => {
  const group = input.state.view.group
  const field = input.state.query.group.field
  if (!group) {
    return true
  }
  if (!field) {
    return false
  }

  const currentValue = readDraftValue(input.draft, group.field)
  const next = groupCore.write.next({
    field,
    group,
    currentValue,
    toKey: input.sectionKey
  })
  if (next.kind === 'invalid') {
    return false
  }

  if (next.kind === 'clear') {
    if (currentValue !== undefined) {
      if (
        isTitleFieldId(group.field)
        && typeof currentValue === 'string'
        && currentValue.length === 0
      ) {
        input.draft.title = ''
        return true
      }

      return false
    }

    if (isTitleFieldId(group.field)) {
      input.draft.title = ''
      return true
    }

    delete input.draft.values[group.field]
    input.draft.clearFieldIds.add(group.field)
    return true
  }

  if (currentValue !== undefined && !sameJsonValue(currentValue, next.value)) {
    return false
  }

  writeDraftValue(input.draft, group.field, next.value)
  return true
}

const toRecordCreateInput = (input: {
  recordId: RecordId
  draft: CreateDraftState
}) => {
  const values: Partial<Record<FieldId, unknown>> = {}

  for (const [fieldId, value] of Object.entries(input.draft.values) as [FieldId, unknown][]) {
    if (value === undefined || isTitleFieldId(fieldId)) {
      continue
    }
    values[fieldId] = value
  }

  return {
    id: input.recordId,
    ...(input.draft.title !== undefined
      ? { title: input.draft.title }
      : {}),
    ...(Object.keys(values).length
      ? { values }
      : {})
  }
}

export const createActiveRecordsApi = (input: {
  base: ActiveViewContext
}): ActiveRecordsApi => ({
  create: createInput => {
    const state = input.base.snapshot()
    if (!state) {
      return undefined
    }

    const context = resolveCreateContext({
      state,
      sectionKey: createInput?.sectionKey,
      before: createInput?.before
    })
    if (!context) {
      return undefined
    }

    const draft = createDraftState(
      createInput?.set,
      fieldId => fieldId === TITLE_FIELD_ID || input.base.reader.fields.has(fieldId)
    )
    if (!draft) {
      return undefined
    }

    if (!applyGroupDefault({
      state,
      draft,
      sectionKey: context.sectionKey
    })) {
      return undefined
    }

    if (!applyFilterDefaults({
      state,
      draft
    })) {
      return undefined
    }

    const recordId = createRecordId()
    const actions: Action[] = [{
      type: 'record.create',
      input: toRecordCreateInput({
        recordId,
        draft
      })
    }]

    const clearFieldIds = Array.from(draft.clearFieldIds)
      .filter(fieldId => !isTitleFieldId(fieldId))
    if (clearFieldIds.length) {
      actions.push({
        type: 'record.fields.writeMany',
        input: {
          recordIds: [recordId],
          clear: clearFieldIds
        }
      })
    }

    if (!state.view.sort.length && context.beforeRecordId) {
      const moveAction = createMoveOrderAction(
        input.base,
        [recordId],
        context.beforeRecordId
      )
      if (moveAction) {
        actions.push(moveAction)
      }
    }

    const result = input.base.dispatch(actions)
    return result.applied
      ? recordId
      : undefined
  }
})
