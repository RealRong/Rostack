import { createId } from '@shared/core'
import type {
  CustomFieldId,
  RecordId,
  ViewFilterRuleId,
  ViewId,
  ViewSortRuleId
} from '@dataview/core/contracts'

export type DataviewIdKind =
  | 'record'
  | 'field'
  | 'view'
  | 'filterRule'
  | 'sortRule'

export type DataviewIdOf<TKind extends DataviewIdKind> =
  TKind extends 'record' ? RecordId :
  TKind extends 'field' ? CustomFieldId :
  TKind extends 'view' ? ViewId :
  TKind extends 'filterRule' ? ViewFilterRuleId :
  TKind extends 'sortRule' ? ViewSortRuleId :
  never

const PREFIX_BY_KIND = {
  record: 'record',
  field: 'field',
  view: 'view',
  filterRule: 'filter',
  sortRule: 'sort'
} as const satisfies Record<DataviewIdKind, string>

export const createDataviewId = <TKind extends DataviewIdKind>(
  kind: TKind
): DataviewIdOf<TKind> => createId(PREFIX_BY_KIND[kind]) as DataviewIdOf<TKind>

export const id = {
  create: createDataviewId
} as const
