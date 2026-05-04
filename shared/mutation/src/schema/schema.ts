import {
  compileMutationSchema
} from '../compile/schema'
import {
  MUTATION_COMPILED_SCHEMA,
  MUTATION_SCHEMA
} from './constants'
import type {
  MutationSchema,
  MutationShape
} from './node'

export const schema = <const TShape extends MutationShape>(
  shape: TShape
): MutationSchema<TShape> => ({
  [MUTATION_SCHEMA]: true,
  shape,
  [MUTATION_COMPILED_SCHEMA]: compileMutationSchema(shape)
})
