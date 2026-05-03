import type {
  MutationSchema,
  MutationShape
} from './node'
import {
  finalizeSchema
} from './meta'

export const schema = <const TShape extends MutationShape>(
  shape: TShape
): MutationSchema<TShape> => finalizeSchema(shape) as MutationSchema<TShape>
