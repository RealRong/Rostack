import type {
  Field,
  FieldId,
  FilterOperator,
  FilterRule,
  CustomField,
  Row,
  ViewGroup
} from '../contracts/state'
import {
  TITLE_FIELD_ID
} from '../contracts/state'
import {
  applyFieldFilterPreset as applyCustomFieldFilterPreset,
  createDefaultFieldFilterRule as createDefaultCustomFieldFilterRule,
  getKind,
  getFieldFilterPreset as getCustomFieldFilterPreset,
  getFieldFilterOps as getCustomFieldFilterOps,
  getFieldFilterPresets as getCustomFieldFilterPresets,
  getFieldGroupMeta as getCustomFieldGroupMeta,
  matchFieldFilter as matchCustomFieldFilter,
  resolveGroupBucketDomain,
  resolveGroupBucketEntries,
  type Bucket,
  type FieldGroupMeta
} from './kind'
import {
  createDefaultCustomField
} from './schema'
import {
  hasFieldOptions as supportsFieldOptions
} from './kind/spec'
import {
  canQuickToggleCustomFieldValue,
  resolveCustomFieldPrimaryAction,
  resolveCustomFieldValueBehavior,
  type FieldValueBehavior
} from './behavior'
import {
  getCustomFieldDisplayValue,
  parseCustomFieldDraft,
  type FieldDraftParseResult
} from './value'
import {
  getFieldSearchTokens as getCustomFieldSearchTokens
} from './value/search'
import {
  compareFieldValues as compareCustomFieldValues
} from './value/sort'
import type {
  KindFilterPreset
} from './kind/spec'
export * from './kind'
export * from './kind/spec'
export * from './kind/date'
export * from './kind/status'
export * from './kind/url'
export * from './behavior'
export * from './value'
export * from './value/search'
export * from './value/sort'
export * from './schema'
export * from './options'
export {
  STATUS_CATEGORIES,
  compareStatusFieldValues,
  createDefaultStatusOptions,
  getStatusCategoryColor,
  getStatusCategoryLabel,
  getStatusCategoryOrder,
  getStatusDefaultOption,
  getStatusFieldDefaultOption,
  getStatusOptionCategory,
  getStatusSections,
} from './kind/status'
export {
  createDateGroupValue,
  createDefaultDateFieldConfig,
  formatDateValue,
  getDateFieldConfig,
  isValidDateTimeZone,
  parseDateGroupKey,
  parseDateInputDraft,
  readDateComparableTimestamp
} from './kind/date'
export {
  createDefaultUrlFieldConfig,
  formatUrlDisplayValue
} from './kind/url'
export {
  normalizeSearchableValue,
  isEmptyFieldValue,
  normalizeFieldToken,
  type FieldDraftParseResult
} from './value'
export type { FieldGroupMeta } from './kind'
export type { FieldValueBehavior } from './behavior'
export const createDefaultField = createDefaultCustomField
export const hasFieldOptions = (
  field?: Field
): field is Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }> => (
  isCustomField(field) && supportsFieldOptions(field)
)
export const isCustomField = (
  field: Field | undefined
): field is CustomField => Boolean(field && field.kind !== 'title')

const resolveTitleGroupMeta = (
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): FieldGroupMeta => {
  const kind = getKind('text')
  const mode = group?.mode && kind.group.modes.includes(group.mode)
    ? group.mode
    : kind.group.mode
  const bucketSort = group?.bucketSort && kind.group.sorts.includes(group.bucketSort)
    ? group.bucketSort
    : kind.group.sort

  return {
    modes: kind.group.modes,
    mode,
    sorts: kind.group.sorts,
    sort: bucketSort,
    supportsInterval: Boolean(kind.group.intervalModes?.includes(mode)),
    ...(kind.group.bucketInterval !== undefined
      ? { bucketInterval: kind.group.bucketInterval }
      : {}),
    showEmpty: kind.group.showEmpty
  }
}

export const isTitleFieldId = (
  fieldId: FieldId
): fieldId is typeof TITLE_FIELD_ID => fieldId === TITLE_FIELD_ID

export const isTitleField = (
  field: Pick<Field, 'kind'> | undefined
): field is Extract<Field, { kind: 'title' }> => field?.kind === 'title'

export const getRecordFieldValue = (
  record: Row,
  fieldId: FieldId
): unknown => (
  isTitleFieldId(fieldId)
    ? record.title
    : record.values[fieldId]
)

export const compareFieldValues = (
  field: Field | undefined,
  left: unknown,
  right: unknown
): number => (
  isTitleField(field)
    ? getKind('text').compare(undefined, left, right)
    : compareCustomFieldValues(field, left, right)
)

export const getFieldSearchTokens = (
  field: Field | undefined,
  value: unknown
): string[] => (
  isTitleField(field)
    ? getKind('text').search(undefined, value)
    : getCustomFieldSearchTokens(field, value)
)

export const matchFieldFilter = (
  field: Field | undefined,
  value: unknown,
  op: FilterOperator,
  expected: unknown
): boolean => (
  isTitleField(field)
    ? getKind('text').match(undefined, value, op, expected)
    : matchCustomFieldFilter(field, value, op, expected)
)

export const isFieldFilterEffective = (
  field: Field | undefined,
  op: FilterOperator,
  value: unknown
): boolean => (
  isTitleField(field)
    ? getKind('text').isFilterEffective(undefined, op, value)
    : getKind(field?.kind ?? 'text').isFilterEffective(field, op, value)
)

export const resolveFieldGroupBucketEntries = (
  field: Field | undefined,
  value: unknown,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): readonly Bucket[] => {
  if (!isTitleField(field)) {
    return resolveGroupBucketEntries(field, value, group)
  }

  const kind = getKind('text')
  const meta = resolveTitleGroupMeta(group)
  return kind.groupEntries(undefined, value, meta.mode, meta.bucketInterval)
}

export const resolveFieldGroupBucketDomain = (
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode'>>
): readonly Bucket[] => {
  if (!isTitleField(field)) {
    return resolveGroupBucketDomain(field, group)
  }

  const kind = getKind('text')
  return kind.groupDomain(undefined, resolveTitleGroupMeta(group).mode)
}

export const getFieldGroupMeta = (
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): FieldGroupMeta => (
  isTitleField(field)
    ? resolveTitleGroupMeta(group)
    : getCustomFieldGroupMeta(field, group)
)

export const getFieldFilterOps = (
  field?: Pick<Field, 'kind'>
): readonly FilterOperator[] => (
  isTitleField(field)
    ? getKind('text').filter.ops
    : getCustomFieldFilterOps(field as Pick<CustomField, 'kind'> | undefined)
)

export const getFieldFilterPresets = (
  field?: Pick<Field, 'kind'>
): readonly KindFilterPreset[] => (
  isTitleField(field)
    ? getKind('text').filter.presets
    : getCustomFieldFilterPresets(field as Pick<CustomField, 'kind'> | undefined)
)

export const getFieldFilterPreset = (
  field?: Field,
  rule?: FilterRule
): KindFilterPreset | undefined => {
  const presets = getFieldFilterPresets(field)
  if (!rule) {
    return presets[0]
  }

  return presets.find(preset => (
    preset.operator === rule.op
    && JSON.stringify(preset.value) === JSON.stringify(rule.value)
  )) ?? presets[0]
}

export const createDefaultFieldFilterRule = (
  field: Field
): FilterRule => {
  if (!isTitleField(field)) {
    return createDefaultCustomFieldFilterRule(field)
  }

  const kind = getKind('text')
  const preset = kind.filter.presets[0]
  const op = preset?.operator ?? kind.filter.ops[0] ?? 'contains'

  return {
    field: field.id,
    op,
    value: preset?.value !== undefined
      ? preset.value
      : kind.createFilterValue(undefined, op)
  }
}

export const getFieldDisplayValue = (
  field: Field | undefined,
  value: unknown
): string | undefined => (
  isTitleField(field)
    ? getKind('text').display(undefined, value)
    : getCustomFieldDisplayValue(field, value)
)

export const parseFieldDraft = (
  field: Field | undefined,
  draft: string
): FieldDraftParseResult => (
  isTitleField(field)
    ? getKind('text').parseDraft(undefined, draft)
    : parseCustomFieldDraft(field, draft)
)

export const canQuickToggleFieldValue = (
  field?: Field
) => (
  isTitleField(field)
    ? false
    : canQuickToggleCustomFieldValue(field)
)

export const resolveFieldValueBehavior = (input: {
  exists: boolean
  field?: Field
}) => (
  isTitleField(input.field)
    ? {
        canEdit: input.exists,
        canQuickToggle: false
      }
    : resolveCustomFieldValueBehavior({
        exists: input.exists,
        field: input.field
      })
)

export const resolveFieldPrimaryAction = (input: {
  exists: boolean
  field?: Field
  value: unknown
}) => (
  isTitleField(input.field)
    ? input.exists
      ? {
          kind: 'edit' as const
        }
      : {
          kind: 'select' as const
        }
    : resolveCustomFieldPrimaryAction({
        exists: input.exists,
        field: input.field,
        value: input.value
      })
)

export const applyFieldFilterPreset = (
  rule: FilterRule,
  field: Field | undefined,
  preset: Pick<KindFilterPreset, 'operator' | 'value'>
): FilterRule => {
  if (!isTitleField(field)) {
    return applyCustomFieldFilterPreset(rule, field, preset)
  }

  const currentPreset = getKind('text').filter.presets.find(candidate => (
    candidate.operator === rule.op
    && JSON.stringify(candidate.value) === JSON.stringify(rule.value)
  )) ?? getKind('text').filter.presets[0]

  return {
    field: rule.field,
    op: preset.operator,
    value: preset.value !== undefined
      ? preset.value
      : currentPreset?.value === undefined
        ? rule.value
        : getKind('text').createFilterValue(undefined, preset.operator)
  }
}
