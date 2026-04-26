import { compile, type Issue } from '@shared/mutation'
import { whiteboardReducer } from '@whiteboard/core/reducer'
import type {
  CoreRegistries,
  Document,
  Operation
} from '@whiteboard/core/types'
import {
  createWhiteboardIntentContext,
  type WhiteboardCompileIds
} from '@whiteboard/core/intent/context'
import {
  whiteboardIntentHandlers
} from '@whiteboard/core/intent/handlers'
import type {
  WhiteboardIntent,
  WhiteboardIntentOutput
} from '@whiteboard/core/intent/types'

const reduceIssueCode = (
  code: import('@whiteboard/core/reducer').WhiteboardReduceIssueCode
): 'invalid' | 'cancelled' => code === 'cancelled'
  ? 'cancelled'
  : 'invalid'

export const compileWhiteboardIntents = (input: {
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
  const compiled = compile<Document, WhiteboardIntent, Operation, WhiteboardIntentOutput>({
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
      const reduced = whiteboardReducer.reduce({
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
