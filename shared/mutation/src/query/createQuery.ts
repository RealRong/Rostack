import type {
  CompiledMutationSchema
} from '../compile/schema'
import {
  getCompiledMutationSchema
} from '../compile/schema'
import {
  createMutationReader,
  type MutationReader
} from '../reader/createReader'
import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationDocument
} from '../schema/value'

export type MutationQuery<TSchema extends MutationSchema = MutationSchema> = MutationReader<TSchema> & {
  readonly schema: TSchema
  readonly document: MutationDocument<TSchema>
  readonly compiled: CompiledMutationSchema
}

export const createMutationQuery = <TSchema extends MutationSchema>(
  schema: TSchema,
  document: MutationDocument<TSchema>
): MutationQuery<TSchema> => Object.assign(
  createMutationReader(schema, document),
  {
    schema,
    document,
    compiled: getCompiledMutationSchema(schema)
  }
)

export const query = createMutationQuery
