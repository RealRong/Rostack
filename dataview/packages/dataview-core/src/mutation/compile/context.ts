import type {
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import type {
  MutationCompileReaderTools
} from '@shared/mutation'
import {
  createDataviewQuery,
  type DataviewQuery
} from '../query'
import {
  type DataviewMutationReader
} from '../model'
import type { ValidationCode } from './contracts'

export interface DataviewCompileExpect {
  record(id: RecordId, path?: string): DataRecord | undefined
  field(id: FieldId, path?: string): Field | undefined
  view(id: ViewId, path?: string): View | undefined
}

const issue = (
  tools: MutationCompileReaderTools | undefined,
  code: ValidationCode,
  message: string,
  path?: string
) => {
  tools?.issue({
    source: tools.source,
    code,
    message,
    severity: 'error',
    ...(path === undefined ? {} : { path })
  })
}

const expectEntity = <T,>(
  tools: MutationCompileReaderTools | undefined,
  value: T | undefined,
  input: {
    code: ValidationCode
    message: string
    path?: string
  }
): T | undefined => {
  if (value !== undefined) {
    return value
  }

  issue(
    tools,
    input.code,
    input.message,
    input.path
  )
  return undefined
}

const createCompileExpect = (
  reader: DataviewQuery,
  tools?: MutationCompileReaderTools<string>
): DataviewCompileExpect => ({
  record: (id, path = 'recordId') => expectEntity(
    tools,
    reader.records.get(id),
    {
      code: 'record.notFound',
      message: `Unknown record: ${id}`,
      path
    }
  ),
  field: (id, path = 'fieldId') => expectEntity(
    tools,
    reader.fields.get(id),
    {
      code: 'field.notFound',
      message: `Unknown field: ${id}`,
      path
    }
  ),
  view: (id, path = 'id') => expectEntity(
    tools,
    reader.views.get(id),
    {
      code: 'view.notFound',
      message: `Unknown view: ${id}`,
      path
    }
  )
})

export const createCompileContext = (
  reader: DataviewMutationReader,
  tools?: MutationCompileReaderTools<string>
): {
  query: DataviewQuery
  expect: DataviewCompileExpect
} => {
  const query = createDataviewQuery(reader)
  return {
    query,
    expect: createCompileExpect(query, tools)
  }
}
