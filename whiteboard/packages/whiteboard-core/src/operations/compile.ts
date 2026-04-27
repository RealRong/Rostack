import { compile as runCompile, type Issue } from '@shared/mutation'
import type {
  CoreRegistries,
  Document,
  Operation
} from '@whiteboard/core/types'
import {
  apply as applyOperations
} from '@whiteboard/core/operations/apply'
import {
  createWhiteboardIntentContext,
  type WhiteboardCompileIds
} from '@whiteboard/core/operations/compile-context'
import {
  whiteboardIntentHandlers
} from '@whiteboard/core/operations/compile-handlers'
import type {
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
  issues?: readonly Issue[]
  canApply?: boolean
} => {
  const compiled = runCompile<Document, WhiteboardIntent, Operation, WhiteboardIntentOutput>({
    doc: input.document,
    intents: input.intents,
    run: (ctx, intent) => {
      const compileContext = createWhiteboardIntentContext({
        ctx,
        ids: input.ids,
        registries: input.registries
      })
      const handler = whiteboardIntentHandlers[intent.type]
      return handler(intent as never, compileContext)
    },
    apply: (document, ops) => {
      const reduced = applyOperations({
        doc: document,
        ops,
        origin: 'system'
      })
      if (!reduced.ok) {
        return {
          ok: false as const,
          issue: {
            code: reduceIssueCode(reduced.error.code),
            message: reduced.error.message,
            details: reduced.error.details
          }
        }
      }
      return {
        ok: true as const,
        doc: reduced.doc
      }
    },
    stopOnError: true
  })

  return {
    ops: compiled.ops,
    outputs: compiled.outputs,
    issues: compiled.issues
  }
}

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
