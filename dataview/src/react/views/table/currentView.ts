import type {
  CalculationCollection
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
  Filter,
  View,
  ViewCalc,
  ViewDisplay
} from '@dataview/core/contracts'
import {
  sameAppearanceList,
  sameCalculationsBySection,
  sameFieldList,
  sameSections
} from '@dataview/engine/project/equality'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionKey
} from '@dataview/engine/project/model'
import {
  sameSchema
} from '@dataview/engine/viewmodel/equality'
import type {
  Schema
} from '@dataview/engine/viewmodel/types'

export interface TableCurrentView {
  view: View
  schema: Schema
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
  calculationsBySection: ReadonlyMap<SectionKey, CalculationCollection>
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

const equalIds = <T extends string>(
  left: readonly T[],
  right: readonly T[]
) => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

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

const equalDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
) => equalIds(left.fields, right.fields)

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

export const sameTableCurrentView = (
  left: TableCurrentView | undefined,
  right: TableCurrentView | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return (
    equalView(left.view, right.view)
    && sameSchema(left.schema, right.schema)
    && sameAppearanceList(left.appearances, right.appearances)
    && sameSections(left.sections, right.sections)
    && sameFieldList(left.fields, right.fields)
    && sameCalculationsBySection(left.calculationsBySection, right.calculationsBySection)
  )
}
