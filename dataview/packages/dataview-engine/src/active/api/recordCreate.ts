import type {
  Field,
  FieldId,
  FilterRule,
  Intent,
  RecordCreateInput,
  RecordId,
  View,
  ViewGroupBucketId
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  filter as filterApi
} from '@dataview/core/view'
import {
  group as groupApi
} from '@dataview/core/view'
import { equal } from '@shared/core'

interface CreateDraftState {
  title?: string
  values: Partial<Record<FieldId, unknown>>
  clearFieldIds: Set<FieldId>
}

interface RecordCreateFilterRule {
  fieldId: FieldId
  field?: Field
  rule: FilterRule
  effective: boolean
}

interface BuildRecordCreateIntentsInput {
  recordId: RecordId
  values?: Partial<Record<FieldId, unknown>>
  hasField: (fieldId: FieldId) => boolean
  filter: {
    mode: View['filter']['mode']
    rules: readonly RecordCreateFilterRule[]
  }
  group?: {
    view?: View['group']
    field?: Field
    bucketId?: ViewGroupBucketId
  }
}

const createDraftState = (
  set: BuildRecordCreateIntentsInput['values'],
  hasField: BuildRecordCreateIntentsInput['hasField']
): CreateDraftState | undefined => {
  const values: Partial<Record<FieldId, unknown>> = {}
  let title: string | undefined

  for (const [fieldId, value] of Object.entries(set ?? {}) as [FieldId, unknown][]) {
    if (fieldId !== TITLE_FIELD_ID && !hasField(fieldId)) {
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
): unknown => fieldApi.id.isTitle(fieldId)
  ? draft.title
  : draft.values[fieldId]

const writeDraftValue = (
  draft: CreateDraftState,
  fieldId: FieldId,
  value: unknown
): void => {
  draft.clearFieldIds.delete(fieldId)
  if (fieldApi.id.isTitle(fieldId)) {
    draft.title = String(value ?? '')
    return
  }

  draft.values[fieldId] = value
}

const applyFilterDefaults = (input: {
  filter: BuildRecordCreateIntentsInput['filter']
  draft: CreateDraftState
}): boolean => {
  const effectiveRules = input.filter.rules.filter(rule => rule.effective)
  if (!effectiveRules.length) {
    return true
  }

  if (input.filter.mode !== 'and') {
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

    const next = filterApi.rule.analyze(field, projection.rule).recordDefault
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
  group?: BuildRecordCreateIntentsInput['group']
  draft: CreateDraftState
}): boolean => {
  const group = input.group?.view
  const field = input.group?.field
  const bucketId = input.group?.bucketId
  if (!group) {
    return true
  }
  if (!field || !bucketId) {
    return false
  }

  const currentValue = readDraftValue(input.draft, group.fieldId)
  const next = groupApi.record.writeValue({
    field,
    group,
    currentValue,
    bucketId
  })
  if (next.kind === 'invalid') {
    return false
  }

  if (next.kind === 'clear') {
    if (currentValue !== undefined) {
      if (
        fieldApi.id.isTitle(group.fieldId)
        && typeof currentValue === 'string'
        && currentValue.length === 0
      ) {
        input.draft.title = ''
        return true
      }

      return false
    }

    if (fieldApi.id.isTitle(group.fieldId)) {
      input.draft.title = ''
      return true
    }

    delete input.draft.values[group.fieldId]
    input.draft.clearFieldIds.add(group.fieldId)
    return true
  }

  if (currentValue !== undefined && !equal.sameJsonValue(currentValue, next.value)) {
    return false
  }

  writeDraftValue(input.draft, group.fieldId, next.value)
  return true
}

const toRecordCreateInput = (input: {
  recordId: RecordId
  draft: CreateDraftState
}): RecordCreateInput => {
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

export const buildRecordCreateIntents = (
  input: BuildRecordCreateIntentsInput
): readonly Extract<Intent, {
  type: 'record.create' | 'record.fields.writeMany'
}>[] | undefined => {
  const draft = createDraftState(input.values, input.hasField)
  if (!draft) {
    return undefined
  }
  if (!applyGroupDefault({
    group: input.group,
    draft
  })) {
    return undefined
  }
  if (!applyFilterDefaults({
    filter: input.filter,
    draft
  })) {
    return undefined
  }

  const actions: Extract<Intent, {
    type: 'record.create' | 'record.fields.writeMany'
  }>[] = [{
    type: 'record.create',
    input: toRecordCreateInput({
      recordId: input.recordId,
      draft
    })
  }]

  const clearFieldIds = Array.from(draft.clearFieldIds)
    .filter(fieldId => !fieldApi.id.isTitle(fieldId))
  if (clearFieldIds.length) {
    actions.push({
      type: 'record.fields.writeMany',
      recordIds: [input.recordId],
      clear: clearFieldIds
    })
  }

  return actions
}
