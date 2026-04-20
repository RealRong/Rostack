import type {
  CustomField,
  DataRecord,
  Field,
  FieldId,
  SortDirection,
  ViewGroup
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  canQuickToggleCustomFieldValue,
  resolveCustomFieldPrimaryAction,
  resolveCustomFieldValueBehavior,
  type FieldValueBehavior
} from '@dataview/core/field/behavior'
import {
  getFieldGroupMeta,
  getKind,
  isGroupBucketSort,
  resolveGroupBucketDomain,
  resolveGroupBucketEntries,
  type Bucket,
  type FieldGroupMeta
} from '@dataview/core/field/kind'
import {
  hasFieldOptions
} from '@dataview/core/field/kind/spec'
import {
  compareFieldValues
} from '@dataview/core/field/value/sort'
import {
  getFieldSearchTokens
} from '@dataview/core/field/value/search'
import {
  getCustomFieldDisplayValue,
  isEmptyFieldValue,
  parseCustomFieldDraft,
  type FieldDraftParseResult
} from '@dataview/core/field/value'

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

const isTitleFieldId = (
  fieldId: FieldId
): fieldId is typeof TITLE_FIELD_ID => fieldId === TITLE_FIELD_ID

const isTitleField = (
  field: Pick<Field, 'kind'> | undefined
): field is Extract<Field, { kind: 'title' }> => field?.kind === 'title'

const isCustomField = (
  field: Field | undefined
): field is CustomField => Boolean(field && field.kind !== 'title')

const hasOptionsField = (
  field?: Field
): field is Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }> => (
  isCustomField(field) && hasFieldOptions(field)
)

const readFieldValue = (
  record: DataRecord,
  fieldId: FieldId
): unknown => (
  isTitleFieldId(fieldId)
    ? record.title
    : record.values[fieldId]
)

const compareFieldValue = (
  field: Field | undefined,
  left: unknown,
  right: unknown
): number => {
  const leftEmpty = isEmptyFieldValue(left)
  const rightEmpty = isEmptyFieldValue(right)
  if (leftEmpty || rightEmpty) {
    if (leftEmpty === rightEmpty) {
      return 0
    }

    return leftEmpty ? 1 : -1
  }

  return isTitleField(field)
    ? getKind('text').compare(undefined, left, right)
    : compareFieldValues(field, left, right)
}

const compareFieldSortValue = (
  field: Field | undefined,
  left: unknown,
  right: unknown,
  direction: SortDirection
): number => {
  const result = compareFieldValue(field, left, right)
  if (result === 0) {
    return 0
  }

  const leftEmpty = isEmptyFieldValue(left)
  const rightEmpty = isEmptyFieldValue(right)
  if (leftEmpty || rightEmpty) {
    return result
  }

  return direction === 'asc'
    ? result
    : -result
}

const readFieldSearchTokens = (
  field: Field | undefined,
  value: unknown
): string[] => (
  isTitleField(field)
    ? getKind('text').search(undefined, value)
    : getFieldSearchTokens(field, value)
)

const readFieldGroupEntries = (
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

const readFieldGroupDomain = (
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode'>>
): readonly Bucket[] => {
  if (!isTitleField(field)) {
    return resolveGroupBucketDomain(field, group)
  }

  const kind = getKind('text')
  return kind.groupDomain(undefined, resolveTitleGroupMeta(group).mode)
}

const readFieldGroupMeta = (
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): FieldGroupMeta => (
  isTitleField(field)
    ? resolveTitleGroupMeta(group)
    : getFieldGroupMeta(field, group)
)

const readFieldDisplayValue = (
  field: Field | undefined,
  value: unknown
): string | undefined => (
  isTitleField(field)
    ? getKind('text').display(undefined, value)
    : getCustomFieldDisplayValue(field, value)
)

const parseFieldDraft = (
  field: Field | undefined,
  draft: string
): FieldDraftParseResult => (
  isTitleField(field)
    ? getKind('text').parseDraft(undefined, draft)
    : parseCustomFieldDraft(field, draft)
)

const canQuickToggleFieldValue = (
  field?: Field
) => (
  isTitleField(field)
    ? false
    : canQuickToggleCustomFieldValue(field)
)

const readFieldValueBehavior = (input: {
  exists: boolean
  field?: Field
}): FieldValueBehavior => (
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

const readFieldPrimaryAction = (input: {
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

export type {
  Bucket,
  FieldDraftParseResult,
  FieldGroupMeta,
  FieldValueBehavior
}

export const fieldRuntime = {
  id: {
    isTitle: isTitleFieldId
  },
  kind: {
    isTitle: isTitleField,
    isCustom: isCustomField,
    hasOptions: hasOptionsField
  },
  value: {
    read: readFieldValue
  },
  compare: {
    value: compareFieldValue,
    sort: compareFieldSortValue
  },
  search: {
    tokens: readFieldSearchTokens
  },
  group: {
    meta: readFieldGroupMeta,
    entries: readFieldGroupEntries,
    domain: readFieldGroupDomain,
    sort: {
      isBucket: isGroupBucketSort
    }
  },
  display: {
    value: readFieldDisplayValue
  },
  draft: {
    parse: parseFieldDraft
  },
  behavior: {
    canQuickToggle: canQuickToggleFieldValue,
    value: readFieldValueBehavior,
    primaryAction: readFieldPrimaryAction
  }
} as const
