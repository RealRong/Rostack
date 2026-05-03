import type {
  MutationDelta,
  MutationDeltaSource
} from '../delta/createDelta'
import type {
  MutationQuery
} from '../query/createQuery'
import type {
  MutationReader
} from '../reader/createReader'
import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationDocument
} from '../schema/value'
import type {
  MutationWriter
} from '../writer/createWriter'

export type MutationIssue = {
  code: string
  message: string
  details?: unknown
}

export type MutationIssueCollector = {
  add(issue: MutationIssue): void
  all(): readonly MutationIssue[]
  hasErrors(): boolean
}

export type MutationChangeCollector<TSchema extends MutationSchema> = {
  current(): MutationDelta<TSchema>
  changes(input: MutationDeltaSource<TSchema>): MutationDelta<TSchema>
}

export type MutationCompileContext<
  TSchema extends MutationSchema,
  TIntent,
  TServices
> = {
  intent: TIntent
  document: MutationDocument<TSchema>
  read: MutationReader<TSchema>
  write: MutationWriter<TSchema>
  query: MutationQuery<TSchema>
  change: MutationChangeCollector<TSchema>
  issue: MutationIssueCollector
  services: TServices
}

export type MutationCompileDefinition<
  TSchema extends MutationSchema,
  TIntent extends {
    type: string
  },
  TServices = void
> = {
  handlers: Readonly<Record<string, (
    ctx: MutationCompileContext<TSchema, TIntent, TServices>
  ) => unknown>>
}

export type MutationResult<TData, TCommit> =
  | {
      ok: true
      data: TData
      commit: TCommit
    }
  | {
      ok: false
      issues: readonly MutationIssue[]
    }
