import type {
  Field,
  SortDirection,
  ViewGroup
} from '@dataview/core/contracts'
import type {
  BucketSort
} from '@dataview/core/contracts/state'
import type {
  Bucket
} from '@dataview/core/field/kind'
import {
  type DraftParseResult as FieldDraftParseResult,
  isEmptyValue
} from '@dataview/core/shared/value'
import {
  getKindSpec,
  type KindSpec
} from '@dataview/core/field/kind/spec'

export interface FieldValueBehavior {
  canEdit: boolean
  canQuickToggle: boolean
  toggle?: (value: unknown) => unknown | undefined
}

export interface ResolvedFieldSpec {
  value: KindSpec['value']
  group: KindSpec['group']
  index: KindSpec['index']
  calculation: KindSpec['calculation']
  create: {
    defaultValue?: (field: Field) => unknown | undefined
  }
  view: KindSpec['view']
  behavior: KindSpec['behavior']
}

const compareValueWithEmpty = (
  field: Field | undefined,
  left: unknown,
  right: unknown
): number => {
  const leftEmpty = isEmptyValue(left)
  const rightEmpty = isEmptyValue(right)
  if (leftEmpty || rightEmpty) {
    if (leftEmpty === rightEmpty) {
      return 0
    }

    return leftEmpty ? 1 : -1
  }

  return readFieldSpec(field).value.compare(
    field?.kind === 'title' ? undefined : field,
    left,
    right
  )
}

const compareSortValue = (
  field: Field | undefined,
  left: unknown,
  right: unknown,
  direction: SortDirection
): number => {
  const result = compareValueWithEmpty(field, left, right)
  if (result === 0) {
    return 0
  }

  const leftEmpty = isEmptyValue(left)
  const rightEmpty = isEmptyValue(right)
  if (leftEmpty || rightEmpty) {
    return result
  }

  return direction === 'asc'
    ? result
    : -result
}

const createResolvedFieldSpec = (
  spec: KindSpec
): ResolvedFieldSpec => ({
  value: spec.value,
  group: spec.group,
  index: spec.index,
  calculation: spec.calculation,
  create: {
    ...(spec.create.defaultValue
      ? {
          defaultValue: field => spec.create.defaultValue?.(field.kind === 'title'
            ? undefined as never
            : field)
        }
      : {})
  },
  view: spec.view,
  behavior: spec.behavior
})

const textSpec = getKindSpec('text')
const RESOLVED_FIELD_SPECS = new Map<Exclude<Field['kind'], 'title'>, ResolvedFieldSpec>()

const titleFieldSpec: ResolvedFieldSpec = {
  value: textSpec.value,
  group: textSpec.group,
  index: {
    searchDefaultEnabled: true
  },
  calculation: {
    uniqueKey: (_field, value) => `text:${String(value ?? '').trim()}`
  },
  create: {},
  view: {
    groupUsesOptionColors: false,
    kanbanGroupPriority: 0
  },
  behavior: {
    canQuickToggle: false
  }
}

const readResolvedFieldSpec = (
  kind: Exclude<Field['kind'], 'title'>
): ResolvedFieldSpec => {
  const existing = RESOLVED_FIELD_SPECS.get(kind)
  if (existing) {
    return existing
  }

  const created = createResolvedFieldSpec(getKindSpec(kind))
  RESOLVED_FIELD_SPECS.set(kind, created)
  return created
}

const getFieldSpec = (
  kind: Field['kind'] | 'title'
): ResolvedFieldSpec => (
  kind === 'title'
    ? titleFieldSpec
    : readResolvedFieldSpec(kind)
)

const readFieldSpec = (
  field?: Pick<Field, 'kind'>
): ResolvedFieldSpec => (
  !field || field.kind === 'title'
    ? titleFieldSpec
    : readResolvedFieldSpec(field.kind)
)

const readGroupMeta = (
  field?: Pick<Field, 'kind'>,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval'>>
): {
  modes: readonly string[]
  mode: string
  sorts: readonly BucketSort[]
  sort: BucketSort | ''
  supportsInterval: boolean
  bucketInterval?: number
  showEmpty: boolean
} => {
  const spec = readFieldSpec(field)
  const modes = spec.group.modes
  const mode = group?.mode && modes.includes(group.mode)
    ? group.mode
    : spec.group.defaultMode
  const sorts = spec.group.sorts
  const sort = group?.bucketSort && sorts.includes(group.bucketSort)
    ? group.bucketSort
    : spec.group.defaultSort
  const supportsInterval = spec.group.intervalModes?.includes(mode) ?? false
  const bucketInterval = supportsInterval
    ? group?.bucketInterval ?? spec.group.defaultInterval
    : undefined

  return {
    modes,
    mode,
    sorts,
    sort,
    supportsInterval,
    ...(bucketInterval !== undefined ? { bucketInterval } : {}),
    showEmpty: spec.group.showEmpty
  }
}

const createBucketKeyResolver = (
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketInterval'>>
): ((value: unknown) => readonly string[] | undefined) | undefined => {
  const spec = readFieldSpec(field)
  const defaultResolver = spec.index.bucketKeys
  if (!field || !defaultResolver) {
    return defaultResolver
  }

  const meta = readGroupMeta(field, group)
  if (
    meta.mode === spec.group.defaultMode
    && meta.bucketInterval === spec.group.defaultInterval
  ) {
    return defaultResolver
  }

  if (field.kind === 'status' && meta.mode === 'category') {
    const keysByOptionId = new Map(
      field.options.map(option => [
        option.id,
        option.category
      ] as const)
    )

    return value => {
      const category = typeof value === 'string'
        ? keysByOptionId.get(value)
        : undefined

      return category === undefined
        ? defaultResolver(value)
        : defaultResolver(category)
    }
  }

  return undefined
}

const readDisplayValue = (
  field: Field | undefined,
  value: unknown
): string | undefined => readFieldSpec(field).value.display(
  field?.kind === 'title' ? undefined : field,
  value
)

const parseDraft = (
  field: Field | undefined,
  draft: string
): FieldDraftParseResult => readFieldSpec(field).value.parse(
  field?.kind === 'title' ? undefined : field,
  draft
)

const readSearchTokens = (
  field: Field | undefined,
  value: unknown
): string[] => readFieldSpec(field).value.search(
  field?.kind === 'title' ? undefined : field,
  value
)

const readGroupDomain = (
  field: Field | undefined,
  group?: Partial<Pick<ViewGroup, 'mode'>>
): readonly Bucket[] => {
  const meta = readGroupMeta(field, group)
  return readFieldSpec(field).group.domain(
    field?.kind === 'title' ? undefined : field,
    meta.mode
  )
}

const readGroupEntries = (
  field: Field | undefined,
  value: unknown,
  group?: Partial<Pick<ViewGroup, 'mode' | 'bucketInterval'>>
): readonly Bucket[] => {
  const meta = readGroupMeta(field, group)
  return readFieldSpec(field).group.entries(
    field?.kind === 'title' ? undefined : field,
    value,
    meta.mode,
    meta.bucketInterval
  )
}

const readCanQuickToggle = (
  field?: Field
): boolean => readFieldSpec(field).behavior.canQuickToggle

const readBehavior = (input: {
  exists: boolean
  field?: Field
}): FieldValueBehavior => {
  const spec = readFieldSpec(input.field)
  return {
    canEdit: Boolean(input.field?.kind === 'title' ? input.exists : input.exists && input.field),
    canQuickToggle: input.field?.kind === 'title'
      ? false
      : input.exists && spec.behavior.canQuickToggle,
    ...(spec.behavior.toggle
      ? {
          toggle: spec.behavior.toggle
        }
      : {})
  }
}

const readPrimaryAction = (input: {
  exists: boolean
  field?: Field
  value: unknown
}) => {
  if (!input.exists) {
    return {
      kind: 'select' as const
    }
  }

  if (readCanQuickToggle(input.field)) {
    return {
      kind: 'quickToggle' as const,
      value: readFieldSpec(input.field).behavior.toggle?.(input.value)
    }
  }

  return {
    kind: 'edit' as const
  }
}

export const fieldSpec = {
  get: getFieldSpec,
  read: readFieldSpec,
  value: {
    display: readDisplayValue,
    parse: parseDraft,
    search: readSearchTokens,
    compare: compareValueWithEmpty,
    sort: compareSortValue
  },
  group: {
    meta: readGroupMeta,
    domain: readGroupDomain,
    entries: readGroupEntries
  },
  index: {
    searchDefaultEnabled: (field?: Pick<Field, 'kind'>): boolean => readFieldSpec(field).index.searchDefaultEnabled === true,
    bucket: {
      create: createBucketKeyResolver,
      keys: (field: Field | undefined, value: unknown): readonly string[] | undefined => readFieldSpec(field).index.bucketKeys?.(value)
    },
    sort: {
      of: (field?: Pick<Field, 'kind'>) => readFieldSpec(field).index.sortScalar,
      scalar: (field: Field | undefined, value: unknown): string | number | boolean | undefined => readFieldSpec(field).index.sortScalar?.(value)
    }
  },
  calculation: {
    uniqueKey: (field: Field | undefined, value: unknown): string => readFieldSpec(field).calculation.uniqueKey(field?.kind === 'title' ? undefined : field, value),
    optionIds: (field: Field | undefined, value: unknown): readonly string[] | undefined => readFieldSpec(field).calculation.optionIds?.(field?.kind === 'title' ? undefined : field, value),
    supportsOptionIds: (field?: Pick<Field, 'kind'>): boolean => readFieldSpec(field).calculation.optionIds !== undefined
  },
  create: {
    defaultValue: (field: Field): unknown | undefined => readFieldSpec(field).create.defaultValue?.(field)
  },
  view: {
    groupUsesOptionColors: (field?: Pick<Field, 'kind'>): boolean => readFieldSpec(field).view.groupUsesOptionColors === true,
    kanbanGroupPriority: (field?: Pick<Field, 'kind'>): number => readFieldSpec(field).view.kanbanGroupPriority
  },
  behavior: {
    quickToggle: readCanQuickToggle,
    value: readBehavior,
    primary: readPrimaryAction
  }
} as const
