import type {
  Action,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  group as groupCore
} from '@dataview/core/group'
import {
  view as viewApi
} from '@dataview/core/view'
import { equal } from '@shared/core'
import {
  createRecordId
} from '@dataview/engine/mutate/entityId'
import type {
  ActiveRecordsApi,
  ItemId,
  ViewState
} from '@dataview/engine/contracts'
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
      orders: viewApi.order.reorder({
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

    if (fieldApi.id.isTitle(fieldId)) {
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
  fieldApi.id.isTitle(fieldId)
    ? draft.title
    : draft.values[fieldId]
)

const writeDraftValue = (
  draft: CreateDraftState,
  fieldId: FieldId,
  value: unknown
) => {
  draft.clearFieldIds.delete(fieldId)
  if (fieldApi.id.isTitle(fieldId)) {
    draft.title = String(value ?? '')
    return
  }

  draft.values[fieldId] = value
}

const resolveCreateContext = (input: {
  state: ViewState
  sectionKey?: string
  before?: ItemId
}) => {
  const beforePlacement = input.before === undefined
    ? undefined
    : input.state.items.read.placement(input.before)
  if (input.before !== undefined && !beforePlacement) {
    return undefined
  }

  const nextSectionKey = input.sectionKey
    ?? beforePlacement?.sectionKey
    ?? (!input.state.view.group
      ? input.state.sections.ids[0]
      : undefined)
  if (!nextSectionKey) {
    return undefined
  }

  if (beforePlacement && beforePlacement.sectionKey !== nextSectionKey) {
    return undefined
  }

  const section = input.state.sections.get(nextSectionKey)
  if (!section) {
    return undefined
  }

  if (beforePlacement && !section.itemIds.includes(input.before!)) {
    return undefined
  }

  return {
    sectionKey: nextSectionKey,
    beforeRecordId: beforePlacement?.recordId
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
    if (filterApi.rule.match(field, currentValue, projection.rule)) {
      continue
    }
    if (currentValue !== undefined) {
      return false
    }

    const next = filterApi.rule.defaultValue(
      field,
      projection.rule
    )
    if (!next) {
      return false
    }
    const current = derived.get(next.fieldId)
    if (current !== undefined && !equal.sameJsonValue(current, next.value)) {
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
  const next = groupCore.write.value({
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
        fieldApi.id.isTitle(group.field)
        && typeof currentValue === 'string'
        && currentValue.length === 0
      ) {
        input.draft.title = ''
        return true
      }

      return false
    }

    if (fieldApi.id.isTitle(group.field)) {
      input.draft.title = ''
      return true
    }

    delete input.draft.values[group.field]
    input.draft.clearFieldIds.add(group.field)
    return true
  }

  if (currentValue !== undefined && !equal.sameJsonValue(currentValue, next.value)) {
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
    if (value === undefined || fieldApi.id.isTitle(fieldId)) {
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
      .filter(fieldId => !fieldApi.id.isTitle(fieldId))
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
