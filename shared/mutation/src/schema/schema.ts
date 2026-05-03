import type {
  MutationSchema,
  MutationSchemaChangeFactory,
  MutationSchemaChangeSet,
  MutationShape
} from './node'
import {
  finalizeSchema
} from './meta'
import {
  setSchemaChangeFactory
} from './internals'

const buildSchema = <
  const TShape extends MutationShape,
  TChanges extends MutationSchemaChangeSet = {}
>(
  shape: TShape,
  factory?: MutationSchemaChangeFactory<TShape, TChanges>
): MutationSchema<TShape, TChanges> => {
  const value = finalizeSchema(shape) as MutationSchema<TShape, TChanges>
  const next = Object.assign(value, {
    changes<TNextChanges extends MutationSchemaChangeSet>(
      nextFactory: MutationSchemaChangeFactory<TShape, TNextChanges>
    ) {
      return buildSchema(shape, nextFactory)
    }
  }) as MutationSchema<TShape, TChanges>

  if (factory) {
    setSchemaChangeFactory(next, factory)
  }

  return next
}

export const schema = <const TShape extends MutationShape>(
  shape: TShape
): MutationSchema<TShape> => buildSchema(shape)
