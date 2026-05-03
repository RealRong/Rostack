import {
  createMutationDelta,
  type MutationDelta,
  type MutationDeltaSource
} from '../delta/createDelta'
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

export type MutationQuery<TSchema extends MutationSchema = MutationSchema> =
  MutationReader<TSchema> & {
    changes(input: MutationDeltaSource<TSchema>): MutationDelta<TSchema>
  }

export const createMutationQuery = <TSchema extends MutationSchema>(
  schema: TSchema,
  input: MutationDocument<TSchema> | (() => MutationDocument<TSchema>)
): MutationQuery<TSchema> => Object.assign(
  createMutationReader(schema, input),
  {
    changes(changeInput: MutationDeltaSource<TSchema>) {
      return createMutationDelta(schema, changeInput)
    }
  }
)
