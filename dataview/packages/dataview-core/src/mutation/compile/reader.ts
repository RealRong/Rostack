import type {
  DataRecord,
  EditTarget,
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
  string
} from '@shared/core'
import {
  createDocumentReader,
  type DocumentReader
} from '../../document/reader'
import type {
  ValidationCode
} from './contracts'
type DataviewCompileReaderTools = MutationCompileReaderTools

type RequireById<TId extends string, TEntity> = DocumentReader['fields'] & {
  require(id: TId, path?: string): TEntity | undefined
}

export interface DataviewCompileReader extends Omit<
  DocumentReader,
  'records' | 'fields' | 'views'
> {
  records: Omit<DocumentReader['records'], 'get'> & {
    get(id: RecordId): DataRecord | undefined
    require(id: RecordId, path?: string): DataRecord | undefined
    require(target: EditTarget, path?: string): readonly RecordId[] | undefined
  }
  fields: RequireById<FieldId, Field>
  views: Omit<DocumentReader['views'], 'get'> & {
    get(id: ViewId): View | undefined
    require(id: ViewId, path?: string): View | undefined
  }
}

const issue = (
  tools: DataviewCompileReaderTools | undefined,
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

const requireEntity = <TId extends string, TEntity>(
  tools: DataviewCompileReaderTools | undefined,
  entity: TEntity | undefined,
  input: {
    id: TId
    code: ValidationCode
    message: string
    path?: string
  }
): TEntity | undefined => {
  if (entity !== undefined) {
    return entity
  }

  issue(
    tools,
    input.code,
    input.message,
    input.path
  )
  return undefined
}

const resolveTarget = (
  reader: DocumentReader,
  tools: DataviewCompileReaderTools | undefined,
  target: EditTarget,
  path = 'target'
): readonly RecordId[] | undefined => {
  if (target.type === 'record') {
    const record = requireEntity(
      tools,
      reader.records.get(target.recordId),
      {
        id: target.recordId,
        code: 'record.notFound',
        message: `Unknown record: ${target.recordId}`,
        path: `${path}.recordId`
      }
    )
    return record
      ? [record.id]
      : undefined
  }

  const recordIds = Array.from(new Set(target.recordIds))
  if (recordIds.length === 0) {
    issue(
      tools,
      'batch.emptyCollection',
      `${tools?.source.type ?? 'record target'} requires at least one item`,
      `${path}.recordIds`
    )
    return undefined
  }

  const resolved: RecordId[] = []
  recordIds.forEach((recordId, index) => {
    if (!string.isNonEmptyString(recordId) || !reader.records.has(recordId)) {
      issue(
        tools,
        'record.notFound',
        `Unknown record: ${recordId}`,
        `${path}.recordIds.${index}`
      )
      return
    }

    resolved.push(recordId)
  })

  return resolved.length === recordIds.length
    ? resolved
    : undefined
}

export const createCompileReader = (
  readDocument: () => import('@dataview/core/types').DataDoc,
  tools?: DataviewCompileReaderTools
): DataviewCompileReader => {
  const reader = createDocumentReader(readDocument)
  const requireRecords = ((value: RecordId | EditTarget, path = 'target') => (
    typeof value === 'string'
      ? requireEntity(
          tools,
          reader.records.get(value),
          {
            id: value,
            code: 'record.notFound',
            message: `Unknown record: ${value}`,
            path
          }
        )
      : resolveTarget(reader, tools, value, path)
  )) as DataviewCompileReader['records']['require']

  return {
    ...reader,
    records: {
      ...reader.records,
      require: requireRecords
    },
    fields: {
      ...reader.fields,
      require: (id, path = 'fieldId') => requireEntity(
        tools,
        reader.fields.get(id),
        {
          id,
          code: 'field.notFound',
          message: `Unknown field: ${id}`,
          path
        }
      )
    },
    views: {
      ...reader.views,
      require: (id, path = 'id') => requireEntity(
        tools,
        reader.views.get(id),
        {
          id,
          code: 'view.notFound',
          message: `Unknown view: ${id}`,
          path
        }
      )
    }
  }
}
