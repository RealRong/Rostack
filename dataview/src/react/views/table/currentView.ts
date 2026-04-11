import type {
  CalculationCollection
} from '@dataview/core/calculation'
import {
  sameJsonValue,
  sameOrder
} from '@shared/core'
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
  FieldLookup,
  Section,
  SectionKey
} from '@dataview/engine/project'
import {
  sameFieldLookup
} from '@dataview/engine/project'

export interface TableCurrentView {
  view: View
  fieldLookup: FieldLookup
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
  calculationsBySection: ReadonlyMap<SectionKey, CalculationCollection>
}

const equalIds = <T extends string>(
  left: readonly T[],
  right: readonly T[]
) => sameOrder(left, right)

const calcEntries = (
  calc: ViewCalc
) => Object.entries(calc)
  .sort(([left], [right]) => left.localeCompare(right))

const equalCalc = (
  left: ViewCalc,
  right: ViewCalc
) => sameJsonValue(calcEntries(left), calcEntries(right))

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
  && sameJsonValue(left.options, right.options)
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
    && sameFieldLookup(left.fieldLookup, right.fieldLookup)
    && sameAppearanceList(left.appearances, right.appearances)
    && sameSections(left.sections, right.sections)
    && sameFieldList(left.fields, right.fields)
    && sameCalculationsBySection(left.calculationsBySection, right.calculationsBySection)
  )
}
