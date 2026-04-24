import { compile, type Issue } from '@shared/mutation'
import { whiteboardReducer } from '@whiteboard/core/reducer'
import type {
  CoreRegistries,
  Document,
  Operation,
  Size
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

const previewIssueCode = (
  code: import('@whiteboard/core/reducer').WhiteboardReduceIssueCode
): 'invalid' | 'cancelled' => code === 'cancelled'
  ? 'cancelled'
  : 'invalid'

export const compileWhiteboardIntents = (input: {
  document: Document
  intents: readonly WhiteboardIntent[]
  registries: CoreRegistries
  ids: WhiteboardCompileIds
  nodeSize: Size
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
        registries: input.registries,
        nodeSize: input.nodeSize
      })
      const handler = whiteboardIntentHandlers[intent.type]
      return handler(intent as never, compileContext)
    },
    previewApply: (document, ops) => {
      const preview = whiteboardReducer.reduce({
        doc: document,
        ops,
        origin: 'system'
      })
      if (!preview.ok) {
        return {
          kind: 'block' as const,
          issue: {
            code: previewIssueCode(preview.error.code),
            message: preview.error.message,
            details: preview.error.details
          }
        }
      }
      return preview.doc
    },
    stopOnError: true
  })

  return {
    ops: compiled.ops,
    outputs: compiled.outputs,
    issues: compiled.issues
  }
}
