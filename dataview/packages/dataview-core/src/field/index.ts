import type {
  Action,
  Field,
  FieldId,
  CustomField,
  DataRecord,
  RecordId,
  ViewGroup
} from '#dataview-core/contracts'
import {
  TITLE_FIELD_ID
} from '#dataview-core/contracts/state'
import {
  getKind,
  getFieldGroupMeta as getCustomFieldGroupMeta,
  resolveGroupBucketDomain,
  resolveGroupBucketEntries,
  type Bucket,
  type FieldGroupMeta
} from '#dataview-core/field/kind'
import {
  createDefaultCustomField
} from '#dataview-core/field/schema'
import {
  hasFieldOptions as supportsFieldOptions
} from '#dataview-core/field/kind/spec'
import {
  canQuickToggleCustomFieldValue,
  resolveCustomFieldPrimaryAction,
  resolveCustomFieldValueBehavior,
  type FieldValueBehavior
} from '#dataview-core/field/behavior'
import {
  getCustomFieldDisplayValue,
  parseCustomFieldDraft,
  type FieldDraftParseResult
} from '#dataview-core/field/value'
import {
  getFieldSearchTokens as getCustomFieldSearchTokens
} from '#dataview-core/field/value/search'
import {
  compareFieldValues as compareCustomFieldValues
} from '#dataview-core/field/value/sort'
export * from '#dataview-core/field/kind'
export * from '#dataview-core/field/kind/spec'
export * from '#dataview-core/field/kind/date'
export * from '#dataview-core/field/kind/status'
export * from '#dataview-core/field/kind/url'
export * from '#dataview-core/field/behavior'
export * from '#dataview-core/field/value'
export * from '#dataview-core/field/value/search'
export * from '#dataview-core/field/value/sort'
export * from '#dataview-core/field/schema'
export * from '#dataview-core/field/options'
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
} from '#dataview-core/field/kind/status'
export {
  createDateGroupValue,
  createDefaultDateFieldConfig,
  formatDateValue,
  getDateFieldConfig,
  isValidDateTimeZone,
  parseDateGroupKey,
  parseDateInputDraft,
  readDateComparableTimestamp
} from '#dataview-core/field/kind/date'
export {
  createDefaultUrlFieldConfig,
  formatUrlDisplayValue
} from '#dataview-core/field/kind/url'
export {
  normalizeSearchableValue,
  isEmptyFieldValue,
  normalizeFieldToken,
  type FieldDraftParseResult
} from '#dataview-core/field/value'
export type { FieldGroupMeta } from '#dataview-core/field/kind'
export type { FieldValueBehavior } from '#dataview-core/field/behavior'
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

export const createRecordFieldWriteAction = (
  recordId: RecordId,
  fieldId: FieldId,
  value: unknown | undefined
): Action => (
  isTitleFieldId(fieldId)
    ? {
        type: 'record.patch',
        target: {
          type: 'record',
          recordId
        },
        patch: {
          title: value === undefined
            ? ''
            : String(value ?? '')
        }
      }
    : value === undefined
      ? {
          type: 'value.clear',
          target: {
            type: 'record',
            recordId
          },
          field: fieldId
        }
      : {
          type: 'value.set',
          target: {
            type: 'record',
            recordId
          },
          field: fieldId,
          value
        }
)

export const isTitleField = (
  field: Pick<Field, 'kind'> | undefined
): field is Extract<Field, { kind: 'title' }> => field?.kind === 'title'

export const getRecordFieldValue = (
  record: DataRecord,
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
