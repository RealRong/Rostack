import { collection, store } from '@shared/core'
import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  TableBody,
  TableColumn
} from '@dataview/runtime'

export interface TableDisplayedFields extends collection.OrderedKeyedCollection<FieldId, Field> {}

const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_FIELDS = [] as readonly Field[]

export const EMPTY_TABLE_DISPLAYED_FIELDS: TableDisplayedFields = collection.createOrderedKeyedCollection<FieldId, Field>({
  ids: EMPTY_FIELD_IDS,
  all: EMPTY_FIELDS,
  get: () => undefined
})

const createTableDisplayedFields = (
  columns: readonly TableColumn[]
): TableDisplayedFields => {
  const all = columns.map(column => column.field)
  const ids = all.map(field => field.id)
  const byId = new Map(
    all.map(field => [field.id, field] as const)
  )

  return collection.createOrderedKeyedCollection<FieldId, Field>({
    ids,
    all,
    get: fieldId => byId.get(fieldId)
  })
}

const sameDisplayedFields = (
  left: TableDisplayedFields | undefined,
  right: TableDisplayedFields | undefined
) => left === right || (
  !!left
  && !!right
  && left.all.length === right.all.length
  && left.all.every((field, index) => field === right.all[index])
)

export const createTableDisplayedFieldsStore = (
  bodyStore: store.ReadStore<TableBody | null>
): store.ReadStore<TableDisplayedFields | undefined> => {
  let previousColumns: readonly TableColumn[] | undefined
  let previous: TableDisplayedFields | undefined

  return store.createDerivedStore<TableDisplayedFields | undefined>({
    get: () => {
      const body = store.read(bodyStore)
      if (!body) {
        previousColumns = undefined
        previous = undefined
        return undefined
      }

      if (previous && previousColumns === body.columns) {
        return previous
      }

      previousColumns = body.columns
      previous = createTableDisplayedFields(body.columns)
      return previous
    },
    isEqual: sameDisplayedFields
  })
}
