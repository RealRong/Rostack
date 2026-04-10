import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import type {
  CalculationMetric,
  Field,
  FieldId,
  StatusField,
  View
} from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldOptions
} from '@dataview/core/field'
import {
  buildAggregateState
} from '../../index/aggregate'
import {
  collectTouchedRecordIds
} from '../../index/shared'
import type {
  AggregateEntry,
  AggregateState
} from '../../index/types'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  Section,
  SectionKey
} from '../types'
import type {
  Stage
} from '../runtime/stage'
import {
  isReconcile,
  reuse,
  shouldRun
} from '../runtime/stage'

const EMPTY_DISPLAY = '--'

const formatNumber = (
  value: number,
  options: Intl.NumberFormatOptions = {}
) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  ...options
}).format(value)

const formatPercent = (value: number) => `${formatNumber(value * 100, {
  minimumFractionDigits: value !== 0 && value !== 1 && !Number.isInteger(value * 100)
    ? 1
    : 0,
  maximumFractionDigits: 1
})}%`

const emptyResult = (
  metric: CalculationMetric
): CalculationResult => ({
  kind: 'empty',
  metric,
  display: EMPTY_DISPLAY
})

const scalarResult = (
  metric: CalculationMetric,
  value: number
): CalculationResult => ({
  kind: 'scalar',
  metric,
  value,
  display: formatNumber(value)
})

const percentResult = (
  metric: CalculationMetric,
  numerator: number,
  denominator: number
): CalculationResult => (
  denominator <= 0
    ? emptyResult(metric)
    : {
        kind: 'percent',
        metric,
        numerator,
        denominator,
        value: numerator / denominator,
        display: formatPercent(numerator / denominator)
      }
)

const createDistributionResult = (input: {
  metric: CalculationMetric
  denominator: number
  items: readonly CalculationDistributionItem[]
}): CalculationResult => (
  input.denominator <= 0 || !input.items.length
    ? emptyResult(input.metric)
    : {
        kind: 'distribution',
        metric: input.metric,
        denominator: input.denominator,
        items: input.items,
        display: input.items
          .map(item => (
            input.metric === 'percentByOption'
              ? `${item.label} ${formatPercent(item.percent)}`
              : `${item.label} ${formatNumber(item.count)}`
          ))
          .join(' · ')
      }
)

const readNumericCount = (
  state: AggregateState
) => Array.from(state.numberCounts.values()).reduce((sum, count) => sum + count, 0)

const readMedian = (
  state: AggregateState
): number | undefined => {
  const total = readNumericCount(state)
  if (!total) {
    return undefined
  }

  const targets = total % 2 === 0
    ? [total / 2, total / 2 + 1]
    : [Math.floor(total / 2) + 1]
  const values: number[] = []
  let current = 0

  Array.from(state.numberCounts.entries())
    .sort((left, right) => left[0] - right[0])
    .forEach(([value, count]) => {
      const start = current + 1
      current += count

      targets.forEach(target => {
        if (target >= start && target <= current) {
          values.push(value)
        }
      })
    })

  if (!values.length) {
    return undefined
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const computeStatusDistribution = (
  field: StatusField | undefined,
  metric: CalculationMetric,
  state: AggregateState
): CalculationResult => {
  if (!field) {
    return emptyResult(metric)
  }

  const counts = new Map<string, number>()
  const orderedOptionIds: string[] = []

  getFieldOptions(field).forEach(option => {
    orderedOptionIds.push(option.id)
    counts.set(option.id, state.optionCounts.get(option.id) ?? 0)
  })

  state.optionCounts.forEach((_count, optionId) => {
    if (!orderedOptionIds.includes(optionId)) {
      orderedOptionIds.push(optionId)
    }
  })

  const denominator = Array.from(counts.values()).reduce((sum, count) => sum + count, 0)
  const items = orderedOptionIds
    .map(optionId => {
      const count = counts.get(optionId) ?? state.optionCounts.get(optionId) ?? 0
      if (count <= 0) {
        return undefined
      }

      const option = getFieldOption(field, optionId)
      return {
        key: optionId,
        label: option?.name ?? optionId,
        count,
        percent: denominator > 0 ? count / denominator : 0,
        ...(option?.color ? { color: option.color } : {})
      } satisfies CalculationDistributionItem
    })
    .filter((item): item is CalculationDistributionItem => Boolean(item))

  return createDistributionResult({
    metric,
    denominator,
    items
  })
}

const computeCalculationFromState = (input: {
  field: Field | undefined
  metric: CalculationMetric
  state: AggregateState
}): CalculationResult => {
  const allCount = input.state.count
  const valueCount = input.state.nonEmpty
  const emptyCount = allCount - valueCount

  switch (input.metric) {
    case 'countAll':
      return scalarResult(input.metric, allCount)
    case 'countValues':
    case 'countNonEmpty':
      return scalarResult(input.metric, valueCount)
    case 'countEmpty':
      return scalarResult(input.metric, emptyCount)
    case 'percentEmpty':
      return percentResult(input.metric, emptyCount, allCount)
    case 'percentNonEmpty':
      return percentResult(input.metric, valueCount, allCount)
    case 'countUniqueValues':
      return scalarResult(input.metric, input.state.uniqueCounts.size)
    case 'sum': {
      const numericCount = readNumericCount(input.state)
      return numericCount
        ? scalarResult(input.metric, input.state.sum ?? 0)
        : emptyResult(input.metric)
    }
    case 'average': {
      const numericCount = readNumericCount(input.state)
      return numericCount
        ? scalarResult(input.metric, (input.state.sum ?? 0) / numericCount)
        : emptyResult(input.metric)
    }
    case 'median': {
      const value = readMedian(input.state)
      return value === undefined
        ? emptyResult(input.metric)
        : scalarResult(input.metric, value)
    }
    case 'min':
      return typeof input.state.min === 'number'
        ? scalarResult(input.metric, input.state.min)
        : emptyResult(input.metric)
    case 'max':
      return typeof input.state.max === 'number'
        ? scalarResult(input.metric, input.state.max)
        : emptyResult(input.metric)
    case 'range':
      return typeof input.state.min === 'number' && typeof input.state.max === 'number'
        ? scalarResult(input.metric, input.state.max - input.state.min)
        : emptyResult(input.metric)
    case 'countByOption':
    case 'percentByOption':
      return computeStatusDistribution(
        input.field?.kind === 'status' ? input.field : undefined,
        input.metric,
        input.state
      )
    default:
      return emptyResult(input.metric)
  }
}

const createCalculationCollection = (input: {
  calculations: View['calc']
  fieldsById: ReadonlyMap<FieldId, Field>
  recordIds: readonly FieldId[]
  entriesByField: ReadonlyMap<FieldId, ReadonlyMap<string, AggregateEntry>>
}): CalculationCollection => {
  const byField = new Map<FieldId, CalculationResult>()

  Object.entries(input.calculations).forEach(([fieldId, metric]) => {
    if (!metric) {
      return
    }

    const entries = input.entriesByField.get(fieldId as FieldId)
    const sectionEntries = new Map(
      input.recordIds.flatMap(recordId => {
        const entry = entries?.get(recordId)
        return entry
          ? [[recordId, entry] as const]
          : []
      })
    )
    const state = buildAggregateState(sectionEntries)

    byField.set(
      fieldId as FieldId,
      computeCalculationFromState({
        field: input.fieldsById.get(fieldId as FieldId),
        metric,
        state
      })
    )
  })

  return {
    byField,
    get: fieldId => byField.get(fieldId)
  }
}

const recordIdsOfSection = (input: {
  section: Section
  appearances: ReadonlyMap<AppearanceId, Appearance>
}): readonly string[] => input.section.ids
  .map(appearanceId => input.appearances.get(appearanceId)?.recordId)
  .filter((recordId): recordId is string => Boolean(recordId))

const sameIds = (
  left: readonly AppearanceId[],
  right: readonly AppearanceId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const touchesSection = (input: {
  section: Section
  appearances: ReadonlyMap<AppearanceId, Appearance>
  touchedRecordIds: ReadonlySet<string> | 'all'
}) => {
  if (input.touchedRecordIds === 'all') {
    return true
  }

  const touchedRecordIds = input.touchedRecordIds

  return recordIdsOfSection({
    section: input.section,
    appearances: input.appearances
  }).some(recordId => touchedRecordIds.has(recordId))
}

const createSectionCalculations = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
  section: Section
  appearances: ReadonlyMap<AppearanceId, Appearance>
  entriesByField: ReadonlyMap<FieldId, ReadonlyMap<string, AggregateEntry>>
}): CalculationCollection => createCalculationCollection({
  calculations: input.view.calc,
  fieldsById: input.fieldsById,
  recordIds: recordIdsOfSection({
    section: input.section,
    appearances: input.appearances
  }),
  entriesByField: input.entriesByField
})

export const createCalculationsBySection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
  sections: readonly Section[]
  appearances: ReadonlyMap<AppearanceId, Appearance>
  entriesByField: ReadonlyMap<FieldId, ReadonlyMap<string, AggregateEntry>>
}) => new Map(
  input.sections.map(section => [
    section.key,
    createSectionCalculations({
      view: input.view,
      fieldsById: input.fieldsById,
      section,
      appearances: input.appearances,
      entriesByField: input.entriesByField
    })
  ] as const)
)

const reconcileCalculationsBySection = (input: {
  previous: ReadonlyMap<SectionKey, CalculationCollection> | undefined
  previousSections: readonly Section[] | undefined
  previousAppearances: AppearanceList | undefined
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
  sections: readonly Section[]
  appearances: ReadonlyMap<AppearanceId, Appearance>
  entriesByField: ReadonlyMap<FieldId, ReadonlyMap<string, AggregateEntry>>
  delta: Parameters<typeof collectTouchedRecordIds>[0]
}): ReadonlyMap<SectionKey, CalculationCollection> => {
  if (!input.previous) {
    return createCalculationsBySection({
      view: input.view,
      fieldsById: input.fieldsById,
      sections: input.sections,
      appearances: input.appearances,
      entriesByField: input.entriesByField
    })
  }

  const previousSectionByKey = new Map(
    (input.previousSections ?? []).map(section => [section.key, section] as const)
  )
  const touchedRecordIds = collectTouchedRecordIds(input.delta)
  const next = new Map<SectionKey, CalculationCollection>()

  input.sections.forEach(section => {
    const previousSection = previousSectionByKey.get(section.key)
    const previousCollection = input.previous?.get(section.key)
    const sameMembership = previousSection
      ? sameIds(previousSection.ids, section.ids)
      : false
    const touchesCurrent = touchesSection({
      section,
      appearances: input.appearances,
      touchedRecordIds
    })
    const touchesPrevious = previousSection && input.previousAppearances
      ? touchesSection({
          section: previousSection,
          appearances: input.previousAppearances.byId,
          touchedRecordIds
        })
      : false

    if (previousCollection && sameMembership && !touchesCurrent && !touchesPrevious) {
      next.set(section.key, previousCollection)
      return
    }

    next.set(section.key, createSectionCalculations({
      view: input.view,
      fieldsById: input.fieldsById,
      section,
      appearances: input.appearances,
      entriesByField: input.entriesByField
    }))
  })

  const previousKeys = Array.from(input.previous.keys())
  const sameKeys = previousKeys.length === input.sections.length
    && previousKeys.every((key, index) => key === input.sections[index]?.key)
  const reusedAll = sameKeys
    && input.sections.every(section => next.get(section.key) === input.previous?.get(section.key))

  return reusedAll
    ? input.previous
    : next
}

export const calculationsStage: Stage<ReadonlyMap<SectionKey, CalculationCollection>> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    const sections = input.project.sections
    if (!view || !sections) {
      return undefined
    }

    const sectionProjection = input.next.read.sectionProjection()
    const entriesByField = new Map(
      Object.entries(view.calc).flatMap(([fieldId, metric]) => {
        if (!metric) {
          return []
        }

        const field = input.next.index.calculations.fields.get(fieldId as FieldId)
        return field
          ? [[fieldId as FieldId, field.global.entries] as const]
          : []
      })
    )

    return isReconcile(input.action)
      ? reconcileCalculationsBySection({
          previous: input.prev,
          previousSections: input.previous.sections,
          previousAppearances: input.previous.appearances,
          view,
          fieldsById: input.next.read.fieldsById(),
          sections,
          appearances: sectionProjection.appearances,
          entriesByField,
          delta: input.next.delta
        })
      : createCalculationsBySection({
          view,
          fieldsById: input.next.read.fieldsById(),
          sections,
          appearances: sectionProjection.appearances,
          entriesByField
        })
  }
}
