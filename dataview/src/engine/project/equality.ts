import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import {
  sameJsonValue,
  sameMap,
  sameOrder
} from '@shared/core'
import type {
  Field,
} from '@dataview/core/contracts'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionList,
  SectionKey
} from './readModels'

const equalList = <T,>(
  left: readonly T[],
  right: readonly T[],
  equal: (left: T, right: T) => boolean
) => sameOrder(left, right, equal)

const equalIds = <T extends string>(
  left: readonly T[],
  right: readonly T[]
) => sameOrder(left, right)

const equalField = (
  left: Field,
  right: Field
) => sameJsonValue(left, right)

const equalSection = (
  left: Section,
  right: Section
) => (
  left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.collapsed === right.collapsed
  && equalIds(left.appearanceIds, right.appearanceIds)
  && equalIds(left.recordIds, right.recordIds)
  && sameJsonValue(left.bucket, right.bucket)
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
        && sameOrder(left.items, right.items, equalCalculationDistributionItem)
    case 'empty':
      return right.kind === 'empty'
    default:
      return false
  }
}

const equalCalculationCollection = (
  left: CalculationCollection,
  right: CalculationCollection
) => sameMap(left.byField, right.byField, equalCalculationResult)

export const sameAppearanceList = (
  left: AppearanceList,
  right: AppearanceList
) => (
  equalIds(left.ids, right.ids)
  && left.count === right.count
)

export const sameSectionList = (
  left: SectionList,
  right: SectionList
) => (
  equalIds(left.ids, right.ids)
  && equalList(left.all, right.all, equalSection)
)

export const sameFieldList = (
  left: Pick<FieldList, 'ids' | 'all'>,
  right: Pick<FieldList, 'ids' | 'all'>
) => (
  equalIds(left.ids, right.ids)
  && equalList(left.all, right.all, equalField)
)

export const sameCalculationsBySection = (
  left: ReadonlyMap<SectionKey, CalculationCollection>,
  right: ReadonlyMap<SectionKey, CalculationCollection>
) => sameMap(left, right, equalCalculationCollection)
