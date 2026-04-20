import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import {
  getKind,
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
  convertFieldKind
} from '@dataview/core/field/kind/spec'
import {
  fieldOption
} from '@dataview/core/field/options'
import {
  fieldRuntime,
  type FieldDraftParseResult,
  type FieldValueBehavior
} from '@dataview/core/field/runtime'
import {
  createDefaultCustomField,
  createFieldKey,
  createUniqueFieldName,
  isCustomFieldKind,
  normalizeCustomFields,
  validateCustomFieldShape
} from '@dataview/core/field/schema'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import {
  isEmptyFieldValue,
  normalizeFieldToken,
  normalizeSearchableValue,
  readNumberValue
} from '@dataview/core/field/value'

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
    isTitle: fieldRuntime.id.isTitle
  },
  kind: {
    get: getKind,
    isTitle: fieldRuntime.kind.isTitle,
    isCustom: fieldRuntime.kind.isCustom,
    hasOptions: fieldRuntime.kind.hasOptions,
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
    read: fieldRuntime.value.read,
    empty: isEmptyFieldValue,
    number: readNumberValue,
    token: normalizeFieldToken,
    searchable: normalizeSearchableValue
  },
  compare: {
    value: fieldRuntime.compare.value,
    sort: fieldRuntime.compare.sort
  },
  search: {
    tokens: fieldRuntime.search.tokens
  },
  group: {
    ...fieldRuntime.group
  },
  display: {
    value: fieldRuntime.display.value
  },
  draft: {
    parse: fieldRuntime.draft.parse
  },
  behavior: {
    ...fieldRuntime.behavior
  },
  spec: fieldSpec,
  option: {
    spec: fieldOption.spec,
    token: fieldOption.token,
    read: fieldOption.read,
    match: fieldOption.match,
    write: fieldOption.write
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
