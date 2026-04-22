import type {
  Sorter
} from '@dataview/core/contracts'
import type { SortRuleProjection } from '@dataview/engine'
import { meta } from '@dataview/meta'
import type { TokenTranslator } from '@shared/i18n'
import {
  query
} from '@dataview/runtime'

export const SORT_DIRECTIONS = [
  'asc',
  'desc'
] as const

export const getSorterItemId = (
  sorter: Pick<Sorter, 'field'>,
  index: number
) => query.fields.sorterId(sorter) ?? `sorter_${index}`

export const readSortSummary = (
  rules: readonly SortRuleProjection[],
  t: TokenTranslator
) => {
  if (!rules.length) {
    return t(meta.sort.summary([]).token)
  }

  if (rules.length === 1) {
    return rules[0]?.field?.name ?? t(meta.systemValue.get('field.deleted').token)
  }

  return t(meta.sort.summary(rules.map(rule => rule.sorter)).token)
}
