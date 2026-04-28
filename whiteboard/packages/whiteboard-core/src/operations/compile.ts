import type {
  MutationCompileIssue
} from '@shared/mutation'
import {
  compileMutationIntents,
  normalizeCompileIssue,
  OperationMutationRuntime
} from '@shared/mutation'
import type {
  CoreRegistries,
  Document,
  Operation
} from '@whiteboard/core/types'
import {
  createWhiteboardIntentContext,
  type WhiteboardCompileIds
} from '@whiteboard/core/operations/compile-context'
import {
  whiteboardIntentHandlers
} from '@whiteboard/core/operations/compile-handlers'
import {
  spec
} from '@whiteboard/core/operations/spec'
import type {
  WhiteboardMutationTable,
  WhiteboardIntent,
  WhiteboardIntentOutput
} from '@whiteboard/core/operations/intent-types'

const reduceIssueCode = (
  code: import('@whiteboard/core/reducer/types').WhiteboardReduceIssueCode
): 'invalid' | 'cancelled' => code === 'cancelled'
  ? 'cancelled'
  : 'invalid'

export const compile = (input: {
  document: Document
  intents: readonly WhiteboardIntent[]
  registries: CoreRegistries
  ids: WhiteboardCompileIds
}): {
  ops: readonly Operation[]
  outputs: readonly WhiteboardIntentOutput[]
  issues?: readonly MutationCompileIssue<'invalid' | 'cancelled'>[]
  canApply?: boolean
} => compileMutationIntents<
  Document,
  WhiteboardMutationTable,
  Operation,
  ReturnType<typeof createWhiteboardIntentContext>,
  'invalid' | 'cancelled'
>({
  doc: input.document,
  intents: input.intents,
  handlers: whiteboardIntentHandlers,
  createContext: ({ ctx }) => createWhiteboardIntentContext({
    ctx,
    ids: input.ids,
    registries: input.registries
  }),
  apply: ({
    doc,
    ops
  }) => {
    const reduced = OperationMutationRuntime.reduce({
      doc,
      ops,
      origin: 'system',
      operations: spec
    })
    return reduced.ok
      ? {
          ok: true as const,
          doc: reduced.doc
        }
      : {
          ok: false as const,
          issue: normalizeCompileIssue({
            code: reduceIssueCode(reduced.error.code),
            message: reduced.error.message,
            details: reduced.error.details,
            severity: 'error'
          })
        }
  }
})

export type { WhiteboardCompileIds, WhiteboardIntentContext } from '@whiteboard/core/operations/compile-context'
export type { WhiteboardIntentHandler } from '@whiteboard/core/operations/compile-handlers'
export type {
  CanvasIntent,
  DocumentIntent,
  EdgeBatchUpdate,
  EdgeIntent,
  GroupIntent,
  MindmapBranchBatchUpdate,
  MindmapIntent,
  MindmapTopicBatchUpdate,
  NodeBatchUpdate,
  NodeIntent,
  ReplaceDocumentIntent,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardIntentTable,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intent-types'
