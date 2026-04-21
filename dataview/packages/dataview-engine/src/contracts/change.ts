import type {
  CustomField,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'

export interface EntityPatch<TKey, TValue> {
  ids?: readonly TKey[]
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

export interface DocumentPatch {
  records?: EntityPatch<RecordId, DataRecord>
  fields?: EntityPatch<FieldId, CustomField>
  views?: EntityPatch<ViewId, View>
}
