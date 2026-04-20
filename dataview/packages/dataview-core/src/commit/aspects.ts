import type {
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '@dataview/core/contracts/commit'
import type {
  CustomField,
  DataRecord,
  FieldId,
  View
} from '@dataview/core/contracts/state'
import {
  sameJsonValue,
  sameOptionalOrder
} from '@shared/core'
import {
  filter as filterApi
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

const sameIdList = <T extends string>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined
) => sameOptionalOrder(
  left?.length ? left : undefined,
  right?.length ? right : undefined
)

export const collectViewQueryAspects = (
  previousView: View,
  nextView: View
): readonly ViewQueryAspect[] => {
  const aspects = new Set<ViewQueryAspect>()

  if (!sameSearch(previousView.search, nextView.search)) {
    aspects.add('search')
  }
  if (!filterApi.same(previousView.filter, nextView.filter)) {
    aspects.add('filter')
  }
  if (!sameSorters(previousView.sort, nextView.sort)) {
    aspects.add('sort')
  }
  if (!sameGroup(previousView.group, nextView.group)) {
    aspects.add('group')
  }
  if (!sameIdList(previousView.orders, nextView.orders)) {
    aspects.add('order')
  }

  return Array.from(aspects)
}

export const collectViewLayoutAspects = (
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
  if (!sameJsonValue(previousView.options, nextView.options)) {
    aspects.add('options')
  }

  return Array.from(aspects)
}

export const collectCalculationFields = (
  previousView: View,
  nextView: View
): readonly FieldId[] | undefined => {
  if (sameJsonValue(previousView.calc, nextView.calc)) {
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

export const collectFieldSchemaAspects = (
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
    if (!sameJsonValue(
      'options' in previousField ? previousField.options : undefined,
      'options' in nextField ? nextField.options : undefined
    )) {
      aspects.add('options')
    }
  }
  if (!sameJsonValue(previousField.meta, nextField.meta)) {
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

  if (!sameJsonValue(previousConfig, nextConfig)) {
    aspects.add('config')
  }

  return Array.from(aspects)
}

export const collectRecordPatchAspects = (
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
  if (!sameJsonValue(previousRecord.meta, nextRecord.meta)) {
    aspects.add('meta')
  }

  return Array.from(aspects)
}
