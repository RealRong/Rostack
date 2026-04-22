import type {
  BucketSort,
  Field
} from '@dataview/core/contracts'
import { meta } from '@dataview/meta'
import type {
  ViewGroupProjection
} from '@dataview/engine'
import type {
  TokenTranslator
} from '@shared/i18n'

export const readGroupModeLabel = (
  field: Field | undefined,
  mode: string,
  t: TokenTranslator
) => {
  if (!field) {
    return undefined
  }

  switch (field.kind) {
    case 'text':
    case 'title':
    case 'url':
    case 'email':
    case 'phone':
      return t(meta.ui.viewSettings.groupByValue)
    case 'status':
      return mode === 'category'
        ? t(meta.ui.viewSettings.groupByCategory)
        : t(meta.ui.viewSettings.groupByStatus)
    case 'select':
    case 'multiSelect':
      return t(meta.ui.viewSettings.groupByOption)
    case 'number':
      return t(meta.ui.viewSettings.groupByRange)
    case 'date':
      switch (mode) {
        case 'day':
          return t(meta.ui.viewSettings.groupByDay)
        case 'week':
          return t(meta.ui.viewSettings.groupByWeek)
        case 'month':
          return t(meta.ui.viewSettings.groupByMonth)
        case 'quarter':
          return t(meta.ui.viewSettings.groupByQuarter)
        case 'year':
          return t(meta.ui.viewSettings.groupByYear)
        default:
          return undefined
      }
    default:
      return undefined
  }
}

export const readBucketSortLabel = (
  bucketSort: BucketSort | undefined,
  t: TokenTranslator
) => {
  switch (bucketSort) {
    case 'manual':
      return t(meta.ui.viewSettings.bucketSortManual)
    case 'labelAsc':
      return t(meta.ui.viewSettings.bucketSortLabelAsc)
    case 'labelDesc':
      return t(meta.ui.viewSettings.bucketSortLabelDesc)
    case 'valueAsc':
      return t(meta.ui.viewSettings.bucketSortValueAsc)
    case 'valueDesc':
      return t(meta.ui.viewSettings.bucketSortValueDesc)
    default:
      return undefined
  }
}

export const readGroupSummary = (
  group: Pick<ViewGroupProjection, 'field' | 'mode' | 'bucketSort' | 'bucketInterval'> | undefined,
  t: TokenTranslator
) => {
  if (!group?.field) {
    return t(meta.ui.viewSettings.none)
  }

  const parts = [group.field.name]
  const modeLabel = readGroupModeLabel(group.field, group.mode, t)
  const bucketSortLabel = readBucketSortLabel(group.bucketSort, t)

  if (modeLabel) {
    parts.push(modeLabel)
  }
  if (group.bucketInterval !== undefined) {
    parts.push(String(group.bucketInterval))
  }
  if (bucketSortLabel) {
    parts.push(bucketSortLabel)
  }

  return parts.join(' · ')
}
