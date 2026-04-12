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
  ActiveViewState
} from '@dataview/engine'
import type {
  CustomField,
  Field,
  Filter,
  FieldId,
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
} from '@dataview/engine/project'

export interface TableCurrentView {
  view: View & {
    type: 'table'
  }
  group: ActiveViewState['group']
  sort: ActiveViewState['sort']
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
  calculationsBySection: ReadonlyMap<SectionKey, CalculationCollection>
  groupField?: Field
  customFields: readonly CustomField[]
  visibleFieldIds: readonly FieldId[]
  showVerticalLines: boolean
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
    && left.group === right.group
    && left.sort === right.sort
    && sameAppearanceList(left.appearances, right.appearances)
    && sameSections(left.sections, right.sections)
    && sameFieldList(left.fields, right.fields)
    && sameCalculationsBySection(left.calculationsBySection, right.calculationsBySection)
    && left.groupField === right.groupField
    && left.customFields.length === right.customFields.length
    && left.customFields.every((field, index) => field === right.customFields[index])
    && equalIds(left.visibleFieldIds, right.visibleFieldIds)
    && left.showVerticalLines === right.showVerticalLines
  )
}
