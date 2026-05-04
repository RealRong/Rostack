import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationDocument
} from '../schema/value'
import type {
  MutationWrite
} from '../writer/writes'
import {
  applyMutationWrites
} from './apply'

export const buildMutationInverse = <TSchema extends MutationSchema>(
  schema: TSchema,
  document: MutationDocument<TSchema>,
  writes: readonly MutationWrite[]
): readonly MutationWrite[] => applyMutationWrites(schema, document, writes).inverse
