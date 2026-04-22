import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import { equal } from '@shared/core'
import type {
  Field,
} from '@dataview/core/contracts'
import type {
  FieldList,
  ItemList,
  Section,
  SectionList,
  SectionKey
} from '@dataview/engine/contracts'
import {
  sameList
} from '@dataview/engine/active/publish/reuse'

const equalIds = <T,>(
  left: readonly T[],
  right: readonly T[]
) => equal.sameOrder(left, right)

const equalField = (
  left: Field,
  right: Field
) => equal.sameJsonValue(left, right)

const equalSection = (
  left: Section,
  right: Section
) => (
  left.key === right.key
  && equal.sameJsonValue(left.label, right.label)
  && left.color === right.color
  && left.collapsed === right.collapsed
  && equalIds(left.recordIds, right.recordIds)
  && equal.sameJsonValue(left.bucket, right.bucket)
)

const equalCalculationDistributionItem = (
  left: CalculationDistributionItem,
  right: CalculationDistributionItem
) => (
  left.key === right.key
  && equal.sameJsonValue(left.value, right.value)
  && left.count === right.count
  && left.percent === right.percent
  && left.color === right.color
)

const equalCalculationResult = (
  left: CalculationResult,
  right: CalculationResult
) => {
  if (left.kind !== right.kind || left.metric !== right.metric) {
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
        && equal.sameOrder(left.items, right.items, equalCalculationDistributionItem)
    case 'empty':
      return right.kind === 'empty'
    default:
      return false
  }
}

const equalCalculationCollection = (
  left: CalculationCollection,
  right: CalculationCollection
) => equal.sameMap(left.byField, right.byField, equalCalculationResult)

export const sameItemList = (
  left: ItemList,
  right: ItemList
) => (
  equalIds(left.ids, right.ids)
  && left.count === right.count
)

export const sameSectionList = (
  left: SectionList,
  right: SectionList
) => (
  equalIds(left.ids, right.ids)
  && sameList(left.all, right.all, equalSection)
)

export const sameFieldList = (
  left: Pick<FieldList, 'ids' | 'all'>,
  right: Pick<FieldList, 'ids' | 'all'>
) => (
  equalIds(left.ids, right.ids)
  && sameList(left.all, right.all, equalField)
)

export const sameSummariesBySection = (
  left: ReadonlyMap<SectionKey, CalculationCollection>,
  right: ReadonlyMap<SectionKey, CalculationCollection>
) => equal.sameMap(left, right, equalCalculationCollection)
