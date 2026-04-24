import type {
  DataRecord,
  Field,
  FieldId
} from '@dataview/core/contracts'
import {
  documentValues
} from '@dataview/core/document/values'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  compareGroupBuckets,
  getKind,
  isGroupBucketSort,
  type Bucket,
  type FieldGroupMeta
} from '@dataview/core/field/kind'
import {
  fieldDate,
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
  createDefaultCustomField,
  createFieldKey,
  createUniqueFieldName,
  isCustomFieldKind,
  normalizeCustomFields,
  validateCustomFieldShape
} from '@dataview/core/field/schema'
import {
  type DraftParseResult,
  expandSearchableValue,
  isEmptyValue,
  normalizeValueToken
} from '@dataview/core/shared/value'
import { parse } from '@shared/core'
import {
  fieldSpec,
  type FieldValueBehavior
} from '@dataview/core/field/spec'

const isTitleFieldId = (
  fieldId: FieldId
): fieldId is typeof TITLE_FIELD_ID => fieldId === TITLE_FIELD_ID

const readFieldValue = (
  record: DataRecord,
  fieldId: FieldId
): unknown => documentValues.get(record, fieldId)

export type {
  Bucket,
  DateFieldConfig,
  DateGroupMode,
  DraftParseResult as FieldDraftParseResult,
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
    isTitle: (target?: Pick<Field, 'kind'>): target is Extract<Field, { kind: 'title' }> => target?.kind === 'title',
    isCustom: (target?: Field): target is Exclude<Field, { kind: 'title' }> => Boolean(target && target.kind !== 'title'),
    hasOptions: (target?: Field): target is Extract<Field, { kind: 'select' | 'multiSelect' | 'status' }> => (
      target?.kind === 'select'
      || target?.kind === 'multiSelect'
      || target?.kind === 'status'
    ),
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
    read: readFieldValue,
    empty: isEmptyValue,
    number: parse.readFiniteNumber,
    token: normalizeValueToken,
    searchable: expandSearchableValue
  },
  compare: {
    value: fieldSpec.value.compare,
    sort: fieldSpec.value.sort
  },
  search: {
    tokens: fieldSpec.value.search
  },
  group: {
    meta: fieldSpec.group.meta,
    domain: fieldSpec.group.domain,
    entries: fieldSpec.group.entries,
    compare: compareGroupBuckets,
    sort: {
      isBucket: isGroupBucketSort
    }
  },
  display: {
    value: fieldSpec.value.display
  },
  draft: {
    parse: fieldSpec.value.parse
  },
  behavior: {
    canQuickToggle: fieldSpec.behavior.quickToggle,
    value: fieldSpec.behavior.value,
    primaryAction: fieldSpec.behavior.primary
  },
  spec: fieldSpec,
  option: {
    spec: fieldOption.spec,
    token: fieldOption.token,
    read: fieldOption.read,
    match: fieldOption.match,
    write: fieldOption.write
  },
  date: fieldDate,
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
