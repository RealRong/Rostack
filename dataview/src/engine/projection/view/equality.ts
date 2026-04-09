import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import {
  sameFilterRule
} from '@dataview/core/filter'
import {
  sameGroup
} from '@dataview/core/group'
import {
  sameSearch
} from '@dataview/core/search'
import {
  sameSorters
} from '@dataview/core/sort'
import type {
  Field,
  FieldId,
  Filter,
  View,
  ViewCalc,
  ViewDisplay
} from '@dataview/core/contracts'
import type {
  Appearance,
  AppearanceList,
  Schema,
  Section,
  SectionKey,
  ViewProjection
} from './types'

const equalList = <T,>(
  left: readonly T[],
  right: readonly T[],
  equal: (left: T, right: T) => boolean
) => (
  left.length === right.length
  && left.every((value, index) => equal(value, right[index] as T))
)

const equalIds = <T extends string>(
  left: readonly T[],
  right: readonly T[]
) => equalList(left, right, Object.is)

const equalOptional = <T,>(
  left: T | undefined,
  right: T | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!left || !right) {
    return left === right
  }

  return equal(left, right)
}

const stableSerialize = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}

const equalStableValue = (
  left: unknown,
  right: unknown
) => stableSerialize(left) === stableSerialize(right)

const equalMap = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean
) => {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, value] of left) {
    const next = right.get(key)
    if (next === undefined && !right.has(key)) {
      return false
    }
    if (!equal(value, next as V)) {
      return false
    }
  }

  return true
}

const equalDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
) => equalIds(left.fields, right.fields)

const calcEntries = (
  calc: ViewCalc
) => Object.entries(calc)
  .sort(([left], [right]) => left.localeCompare(right))

const equalCalc = (
  left: ViewCalc,
  right: ViewCalc
) => stableSerialize(calcEntries(left)) === stableSerialize(calcEntries(right))

const equalFilter = (
  left: Filter,
  right: Filter
) => (
  left.mode === right.mode
  && left.rules.length === right.rules.length
  && left.rules.every((rule, index) => sameFilterRule(rule, right.rules[index]!))
)

const equalView = (
  left: View,
  right: View
) => (
  left.id === right.id
  && left.type === right.type
  && left.name === right.name
  && sameSearch(left.search, right.search)
  && equalFilter(left.filter, right.filter)
  && sameSorters(left.sort, right.sort)
  && sameGroup(left.group, right.group)
  && equalCalc(left.calc, right.calc)
  && equalDisplay(left.display, right.display)
  && equalStableValue(left.options, right.options)
  && equalIds(left.orders, right.orders)
)

const equalField = (
  left: Field,
  right: Field
) => equalStableValue(left, right)

const equalSchema = (
  left: Schema,
  right: Schema
) => equalMap(left.fields, right.fields, equalField)

const equalAppearance = (
  left: Appearance,
  right: Appearance
) => (
  left.id === right.id
  && left.recordId === right.recordId
  && left.section === right.section
)

export const sameAppearanceList = (
  left: AppearanceList,
  right: AppearanceList
) => (
  equalIds(left.ids, right.ids)
  && equalMap(left.byId, right.byId, equalAppearance)
)

const equalSection = (
  left: Section,
  right: Section
) => (
  left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.collapsed === right.collapsed
  && equalIds(left.ids, right.ids)
  && equalStableValue(left.bucket, right.bucket)
)

export const sameSections = (
  left: readonly Section[],
  right: readonly Section[]
) => equalList(left, right, equalSection)

export const sameFieldList = (
  left: Pick<ViewProjection['fields'], 'ids' | 'all'>,
  right: Pick<ViewProjection['fields'], 'ids' | 'all'>
) => (
  equalIds(left.ids, right.ids)
  && equalList(left.all, right.all, equalField)
)

const equalCalculationDistributionItem = (
  left: CalculationDistributionItem,
  right: CalculationDistributionItem
) => (
  left.key === right.key
  && left.label === right.label
  && left.count === right.count
  && left.percent === right.percent
  && left.color === right.color
)

const equalCalculationResult = (
  left: CalculationResult,
  right: CalculationResult
) => {
  if (left.kind !== right.kind || left.metric !== right.metric || left.display !== right.display) {
    return false
  }

  switch (left.kind) {
    case 'scalar':
      return right.kind === 'scalar' && left.value === right.value
    case 'percent':
      return right.kind === 'percent'
        && left.numerator === right.numerator
        && left.denominator === right.denominator
        && left.value === right.value
    case 'distribution':
      return right.kind === 'distribution'
        && left.denominator === right.denominator
        && equalList(left.items, right.items, equalCalculationDistributionItem)
    case 'empty':
      return right.kind === 'empty'
    default:
      return false
  }
}

const equalCalculationCollection = (
  left: CalculationCollection,
  right: CalculationCollection
) => equalMap(left.byField, right.byField, equalCalculationResult)

export const sameCalculationsBySection = (
  left: ReadonlyMap<SectionKey, CalculationCollection>,
  right: ReadonlyMap<SectionKey, CalculationCollection>
) => equalMap(left, right, equalCalculationCollection)

export const sameViewProjection = (
  left: ViewProjection | undefined,
  right: ViewProjection | undefined
) => equalOptional(left, right, (current, next) => (
  equalView(current.view, next.view)
  && equalSchema(current.schema, next.schema)
  && sameAppearanceList(current.appearances, next.appearances)
  && sameSections(current.sections, next.sections)
  && sameFieldList(current.fields, next.fields)
  && sameCalculationsBySection(current.calculationsBySection, next.calculationsBySection)
))

export const viewProjection = {
  equal: sameViewProjection
} as const
