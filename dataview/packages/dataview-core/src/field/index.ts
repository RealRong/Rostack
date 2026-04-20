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
  getKind,
  getFieldGroupMeta as getCustomFieldGroupMeta,
  isGroupBucketSort,
  resolveGroupBucketDomain,
  resolveGroupBucketEntries,
  type Bucket,
  type FieldGroupMeta
} from '@dataview/core/field/kind'
import {
  createDateGroupKey,
  createDateGroupValue,
  createDefaultDateFieldConfig,
  DATE_DISPLAY_FORMATS,
  DATE_GROUP_MODES,
  DATE_TIME_FORMATS,
  DATE_VALUE_KINDS,
  formatDateGroupTitle,
  formatDateValue,
  formatTimeZoneLabel,
  getAvailableTimezones,
  getDateFieldConfig,
  getDateGroupKey,
  getDateSearchTokens,
  getDateSortKey,
  isValidDateTimeZone,
  parseDateGroupKey,
  parseDateInputDraft,
  readDateComparableTimestamp,
  readDateGroupStart,
  readDatePrimaryParts,
  readDatePrimaryString,
  readDateValue,
  readDateValueKind,
  resolveDefaultDateTimezone,
  resolveDefaultDateValueKind,
  type DateFieldConfig,
  type DateGroupMode
} from '@dataview/core/field/kind/date'
import {
  compareStatusFieldValues,
  createDefaultStatusOptions,
  getStatusCategoryColor,
  getStatusCategoryLabel,
  getStatusCategoryOrder,
  getStatusDefaultOption,
  getStatusFieldDefaultOption,
  getStatusOptionCategory,
  getStatusSections,
  STATUS_CATEGORIES,
  type StatusSection
} from '@dataview/core/field/kind/status'
import {
  hasFieldOptions as supportsFieldOptions
} from '@dataview/core/field/kind/spec'
import {
  convertFieldKind
} from '@dataview/core/field/kind/spec'
import {
  containsFieldOptionToken,
  createUniqueFieldOptionToken,
  findFieldOption,
  findFieldOptionByName,
  getFieldOption,
  getFieldOptionOrder,
  getFieldOptions,
  getFieldOptionTokens,
  matchesFieldOptionValue,
  normalizeOptionToken,
  replaceFieldOptions
} from '@dataview/core/field/options'
import {
  getFieldOptionSpec
} from '@dataview/core/field/options/spec'
import {
  createDefaultCustomField,
  createFieldKey,
  createUniqueFieldName,
  isCustomFieldKind,
  normalizeCustomFields,
  validateCustomFieldShape
} from '@dataview/core/field/schema'
import {
  readFieldSpec
} from '@dataview/core/field/spec'
import {
  getCustomFieldDisplayValue,
  isEmptyFieldValue,
  normalizeFieldToken,
  normalizeSearchableValue,
  parseCustomFieldDraft,
  readNumberValue,
  type FieldDraftParseResult
} from '@dataview/core/field/value'
import {
  getFieldSearchTokens as getCustomFieldSearchTokens
} from '@dataview/core/field/value/search'
import {
  compareFieldValues as compareCustomFieldValues
} from '@dataview/core/field/value/sort'

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

const hasOptions = (
  field?: Field
): field is Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }> => (
  isCustomField(field) && supportsFieldOptions(field)
)

const readValue = (
  record: DataRecord,
  fieldId: FieldId
): unknown => (
  isTitleFieldId(fieldId)
    ? record.title
    : record.values[fieldId]
)

const compareValue = (
  fieldEntry: Field | undefined,
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

  return isTitleField(fieldEntry)
    ? getKind('text').compare(undefined, left, right)
    : compareCustomFieldValues(fieldEntry, left, right)
}

const compareSortValue = (
  fieldEntry: Field | undefined,
  left: unknown,
  right: unknown,
  direction: SortDirection
): number => {
  const result = compareValue(fieldEntry, left, right)
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

const readSearchTokens = (
  fieldEntry: Field | undefined,
  value: unknown
): string[] => (
  isTitleField(fieldEntry)
    ? getKind('text').search(undefined, value)
    : getCustomFieldSearchTokens(fieldEntry, value)
)

const getGroupEntries = (
  fieldEntry: Field | undefined,
  value: unknown,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): readonly Bucket[] => {
  if (!isTitleField(fieldEntry)) {
    return resolveGroupBucketEntries(fieldEntry, value, group)
  }

  const kind = getKind('text')
  const meta = resolveTitleGroupMeta(group)
  return kind.groupEntries(undefined, value, meta.mode, meta.bucketInterval)
}

const getGroupDomain = (
  fieldEntry: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode'>>
): readonly Bucket[] => {
  if (!isTitleField(fieldEntry)) {
    return resolveGroupBucketDomain(fieldEntry, group)
  }

  const kind = getKind('text')
  return kind.groupDomain(undefined, resolveTitleGroupMeta(group).mode)
}

const getGroupMeta = (
  fieldEntry: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): FieldGroupMeta => (
  isTitleField(fieldEntry)
    ? resolveTitleGroupMeta(group)
    : getCustomFieldGroupMeta(fieldEntry, group)
)

const displayValue = (
  fieldEntry: Field | undefined,
  value: unknown
): string | undefined => (
  isTitleField(fieldEntry)
    ? getKind('text').display(undefined, value)
    : getCustomFieldDisplayValue(fieldEntry, value)
)

const parseDraft = (
  fieldEntry: Field | undefined,
  draft: string
): FieldDraftParseResult => (
  isTitleField(fieldEntry)
    ? getKind('text').parseDraft(undefined, draft)
    : parseCustomFieldDraft(fieldEntry, draft)
)

const canQuickToggle = (
  fieldEntry?: Field
) => (
  isTitleField(fieldEntry)
    ? false
    : canQuickToggleCustomFieldValue(fieldEntry)
)

const getValueBehavior = (input: {
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

const getPrimaryAction = (input: {
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
  DateFieldConfig,
  DateGroupMode,
  FieldDraftParseResult,
  FieldGroupMeta,
  FieldValueBehavior,
  StatusSection
}

export const field = {
  id: {
    isTitle: isTitleFieldId
  },
  kind: {
    get: getKind,
    isTitle: isTitleField,
    isCustom: isCustomField,
    hasOptions,
    convert: convertFieldKind
  },
  create: {
    default: createDefaultCustomField
  },
  schema: {
    normalize: normalizeCustomFields,
    validate: validateCustomFieldShape,
    key: {
      create: createFieldKey
    },
    name: {
      unique: createUniqueFieldName
    },
    kind: {
      isCustom: isCustomFieldKind
    }
  },
  value: {
    read: readValue,
    empty: isEmptyFieldValue,
    number: readNumberValue,
    token: normalizeFieldToken,
    searchable: normalizeSearchableValue
  },
  compare: {
    value: compareValue,
    sort: compareSortValue
  },
  search: {
    tokens: readSearchTokens
  },
  group: {
    meta: getGroupMeta,
    entries: getGroupEntries,
    domain: getGroupDomain,
    sort: {
      isBucket: isGroupBucketSort
    }
  },
  display: {
    value: displayValue
  },
  draft: {
    parse: parseDraft
  },
  behavior: {
    canQuickToggle,
    value: getValueBehavior,
    primaryAction: getPrimaryAction
  },
  spec: {
    get: readFieldSpec
  },
  option: {
    spec: {
      get: getFieldOptionSpec
    },
    normalizeToken: normalizeOptionToken,
    list: getFieldOptions,
    get: getFieldOption,
    find: findFieldOption,
    findByName: findFieldOptionByName,
    tokens: getFieldOptionTokens,
    order: getFieldOptionOrder,
    matches: matchesFieldOptionValue,
    contains: containsFieldOptionToken,
    createToken: createUniqueFieldOptionToken,
    replace: replaceFieldOptions
  },
  date: {
    config: {
      default: createDefaultDateFieldConfig,
      get: getDateFieldConfig
    },
    formats: {
      date: DATE_DISPLAY_FORMATS,
      time: DATE_TIME_FORMATS,
      value: DATE_VALUE_KINDS,
      group: DATE_GROUP_MODES
    },
    value: {
      read: readDateValue,
      kind: readDateValueKind,
      primaryString: readDatePrimaryString,
      primaryParts: readDatePrimaryParts,
      comparableTimestamp: readDateComparableTimestamp
    },
    group: {
      key: getDateGroupKey,
      sortKey: getDateSortKey,
      createKey: createDateGroupKey,
      parseKey: parseDateGroupKey,
      start: readDateGroupStart,
      title: formatDateGroupTitle,
      createValue: createDateGroupValue
    },
    draft: {
      parse: parseDateInputDraft
    },
    display: {
      value: formatDateValue
    },
    search: {
      tokens: getDateSearchTokens
    },
    default: {
      valueKind: resolveDefaultDateValueKind,
      timezone: resolveDefaultDateTimezone
    },
    timezone: {
      isValid: isValidDateTimeZone,
      list: getAvailableTimezones,
      label: formatTimeZoneLabel
    }
  },
  status: {
    categories: STATUS_CATEGORIES,
    compare: compareStatusFieldValues,
    sections: getStatusSections,
    createOptions: createDefaultStatusOptions,
    category: {
      label: getStatusCategoryLabel,
      color: getStatusCategoryColor,
      order: getStatusCategoryOrder,
      get: getStatusOptionCategory
    },
    defaultOption: {
      get: getStatusDefaultOption,
      forField: getStatusFieldDefaultOption
    }
  }
} as const
