import {
  createMutationChange,
  type MutationChange
} from '../change/createChange'
import {
  getCompiledMutationSchema,
  type CompiledMutationSchema
} from '../compile/schema'
import type {
  MutationCompile
} from '../compile/types'
import {
  createMutationHistory,
  type MutationOrigin
} from './history'
import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationDocument
} from '../schema/value'
import type {
  MutationWrite
} from '../writer/writes'

export type MutationCommit<TSchema extends MutationSchema> = {
  kind: 'apply' | 'replace'
  origin: MutationOrigin
  document: MutationDocument<TSchema>
  writes: readonly MutationWrite[]
  inverse: readonly MutationWrite[]
  change: MutationChange<TSchema>
}

type MutationEngineOptions<
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  } = never,
  TServices = void
> = {
  schema: TSchema
  document: MutationDocument<TSchema>
  normalize?: (document: MutationDocument<TSchema>) => MutationDocument<TSchema>
  compile?: MutationCompile<TSchema, TIntent, TServices>
  services?: TServices
  history?: ReturnType<typeof createMutationHistory>
}

export type MutationEngine<TSchema extends MutationSchema> = {
  readonly schema: TSchema
  readonly compiled: CompiledMutationSchema
  document(): MutationDocument<TSchema>
  replace(
    document: MutationDocument<TSchema>,
    origin?: MutationOrigin
  ): MutationCommit<TSchema>
}

export const createMutationEngine = <
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  } = never,
  TServices = void
>(
  options: MutationEngineOptions<TSchema, TIntent, TServices>
): MutationEngine<TSchema> => {
  const history = options.history ?? createMutationHistory()
  const compiled = getCompiledMutationSchema(options.schema)
  let currentDocument = options.normalize
    ? options.normalize(options.document)
    : options.document

  void history
  void options.compile
  void options.services

  return {
    schema: options.schema,
    compiled,
    document() {
      return currentDocument
    },
    replace(document, origin = 'system') {
      currentDocument = options.normalize
        ? options.normalize(document)
        : document

      return {
        kind: 'replace',
        origin,
        document: currentDocument,
        writes: [],
        inverse: [],
        change: createMutationChange(options.schema, [])
      }
    }
  }
}
