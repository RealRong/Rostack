import type {
  CommitDelta,
  DataDoc,
  FieldId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentFieldIds
} from '@dataview/core/document'
import {
  getFieldDisplayValue,
  getRecordFieldValue,
  isEmptyFieldValue
} from '@dataview/core/field'
import type {
  AggregateState,
  CalculationIndex,
  FieldCalcIndex,
  RecordIndex
} from './types'

const buildAggregateState = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): AggregateState => {
  const field = getDocumentFieldById(document, fieldId)
  let count = 0
  let nonEmpty = 0
  let sum = 0
  let hasNumber = false
  let min: number | string | null | undefined
  let max: number | string | null | undefined
  const distribution = new Map<string, number>()

  records.ids.forEach(recordId => {
    const row = records.rows.get(recordId)
    if (!row) {
      return
    }

    count += 1
    const value = getRecordFieldValue(row, fieldId)
    if (isEmptyFieldValue(value)) {
      return
    }

    nonEmpty += 1
    if (typeof value === 'number' && Number.isFinite(value)) {
      hasNumber = true
      sum += value
      min = min === undefined ? value : Math.min(min as number, value)
      max = max === undefined ? value : Math.max(max as number, value)
    } else if (typeof value === 'string') {
      min = min === undefined ? value : String(min) < value ? min : value
      max = max === undefined ? value : String(max) > value ? max : value
    }

    const label = getFieldDisplayValue(field, value) ?? JSON.stringify(value)
    distribution.set(label, (distribution.get(label) ?? 0) + 1)
  })

  return {
    count,
    nonEmpty,
    ...(hasNumber ? { sum } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    distribution
  }
}

const buildFieldCalcIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): FieldCalcIndex => ({
  global: buildAggregateState(document, records, fieldId)
})

const collectTouchedFieldIds = (
  delta: CommitDelta
) => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
    || delta.entities.records?.update === 'all'
    || delta.entities.records?.add?.length
    || delta.entities.records?.remove?.length
  ) {
    return 'all' as const
  }

  const fields = new Set<FieldId>()
  delta.entities.fields?.add?.forEach(fieldId => fields.add(fieldId))
  if (Array.isArray(delta.entities.fields?.update)) {
    delta.entities.fields.update.forEach(fieldId => fields.add(fieldId))
  }
  delta.entities.fields?.remove?.forEach(fieldId => fields.add(fieldId))
  if (Array.isArray(delta.entities.values?.fields)) {
    delta.entities.values.fields.forEach(fieldId => fields.add(fieldId))
  }

  for (const item of delta.semantics) {
    if (item.kind === 'record.patch' && item.aspects.includes('title')) {
      fields.add('title')
    }
  }

  return fields
}

export const buildCalculationIndex = (
  document: DataDoc,
  records: RecordIndex,
  rev = 1
): CalculationIndex => ({
  fields: new Map(
    getDocumentFieldIds(document).map(fieldId => [
      fieldId,
      buildFieldCalcIndex(document, records, fieldId)
    ] as const)
  ),
  rev
})

export const syncCalculationIndex = (
  previous: CalculationIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): CalculationIndex => {
  if (!delta.summary.indexes) {
    return previous
  }

  const touched = collectTouchedFieldIds(delta)
  if (touched === 'all') {
    return buildCalculationIndex(document, records, previous.rev + 1)
  }

  if (!touched.size) {
    return previous
  }

  const nextFields = new Map(previous.fields)
  touched.forEach(fieldId => {
    if (!getDocumentFieldById(document, fieldId)) {
      nextFields.delete(fieldId)
      return
    }

    nextFields.set(fieldId, buildFieldCalcIndex(document, records, fieldId))
  })

  return {
    fields: nextFields,
    rev: previous.rev + 1
  }
}
