import type {
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '@dataview/core/types/commit'
import type {
  CustomField,
  DataRecord,
  FieldId,
  View
} from '@dataview/core/types/state'
import { equal } from '@shared/core'
import {
  filter as filterApi
} from '@dataview/core/view'
import { group } from '@dataview/core/view'
import { search } from '@dataview/core/view'
import { sort } from '@dataview/core/view'

const sameIdList = <T extends string>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined
) => equal.sameOptionalOrder(
  left?.length ? left : undefined,
  right?.length ? right : undefined
)

const collectViewQueryAspects = (
  previousView: View,
  nextView: View
): readonly ViewQueryAspect[] => {
  const aspects = new Set<ViewQueryAspect>()

  if (!search.state.same(previousView.search, nextView.search)) {
    aspects.add('search')
  }
  if (!filterApi.state.same(previousView.filter, nextView.filter)) {
    aspects.add('filter')
  }
  if (!sort.rules.same(previousView.sort.rules, nextView.sort.rules)) {
    aspects.add('sort')
  }
  if (!group.state.same(
    'group' in previousView ? previousView.group : undefined,
    'group' in nextView ? nextView.group : undefined
  )) {
    aspects.add('group')
  }
  if (!sameIdList(previousView.orders, nextView.orders)) {
    aspects.add('order')
  }

  return Array.from(aspects)
}

const collectViewLayoutAspects = (
  previousView: View,
  nextView: View
): readonly ViewLayoutAspect[] => {
  const aspects = new Set<ViewLayoutAspect>()

  if (previousView.name !== nextView.name) {
    aspects.add('name')
  }
  if (previousView.type !== nextView.type) {
    aspects.add('type')
  }
  if (!sameIdList(previousView.display.fields, nextView.display.fields)) {
    aspects.add('display')
  }
  if (!equal.sameJsonValue(previousView.options, nextView.options)) {
    aspects.add('options')
  }

  return Array.from(aspects)
}

const collectCalculationFields = (
  previousView: View,
  nextView: View
): readonly FieldId[] | undefined => {
  if (equal.sameJsonValue(previousView.calc, nextView.calc)) {
    return undefined
  }

  const fields = new Set<FieldId>([
    ...Object.keys(previousView.calc),
    ...Object.keys(nextView.calc)
  ])

  return fields.size
    ? Array.from(fields).sort()
    : undefined
}

const collectFieldSchemaAspects = (
  previousField: CustomField | undefined,
  nextField: CustomField | undefined
): readonly FieldSchemaAspect[] => {
  if (!previousField && !nextField) {
    return []
  }

  if (!previousField || !nextField) {
    return ['all']
  }

  const aspects = new Set<FieldSchemaAspect>()

  if (previousField.name !== nextField.name) {
    aspects.add('name')
  }
  if (previousField.kind !== nextField.kind) {
    aspects.add('kind')
  }
  if ('options' in previousField || 'options' in nextField) {
    if (!equal.sameJsonValue(
      'options' in previousField ? previousField.options : undefined,
      'options' in nextField ? nextField.options : undefined
    )) {
      aspects.add('options')
    }
  }
  if (!equal.sameJsonValue(previousField.meta, nextField.meta)) {
    aspects.add('meta')
  }

  const previousConfig = {
    ...previousField,
    meta: undefined,
    name: undefined,
    kind: undefined,
    ...('options' in previousField ? { options: undefined } : {})
  }
  const nextConfig = {
    ...nextField,
    meta: undefined,
    name: undefined,
    kind: undefined,
    ...('options' in nextField ? { options: undefined } : {})
  }

  if (!equal.sameJsonValue(previousConfig, nextConfig)) {
    aspects.add('config')
  }

  return Array.from(aspects)
}

const collectRecordPatchAspects = (
  previousRecord: DataRecord | undefined,
  nextRecord: DataRecord | undefined
): readonly RecordPatchAspect[] => {
  if (!previousRecord || !nextRecord) {
    return []
  }

  const aspects = new Set<RecordPatchAspect>()

  if (previousRecord.title !== nextRecord.title) {
    aspects.add('title')
  }
  if (previousRecord.type !== nextRecord.type) {
    aspects.add('type')
  }
  if (!equal.sameJsonValue(previousRecord.meta, nextRecord.meta)) {
    aspects.add('meta')
  }

  return Array.from(aspects)
}

export const commitAspects = {
  view: {
    query: collectViewQueryAspects,
    layout: collectViewLayoutAspects,
    calculationFields: collectCalculationFields
  },
  field: {
    schema: collectFieldSchemaAspects
  },
  record: {
    patch: collectRecordPatchAspects
  }
} as const
