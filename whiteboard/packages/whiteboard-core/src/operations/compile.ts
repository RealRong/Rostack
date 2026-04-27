import type {
  MutationCompileCtx,
  MutationCompileIssue
} from '@shared/mutation'
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

const normalizeIssue = (
  issue: MutationCompileIssue<'invalid' | 'cancelled'>
): Required<Pick<MutationCompileIssue<'invalid' | 'cancelled'>, 'code' | 'message' | 'severity'>> & Omit<MutationCompileIssue<'invalid' | 'cancelled'>, 'severity'> => ({
  ...issue,
  severity: issue.severity ?? 'error'
})

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
} => {
  const ops: Operation[] = []
  const outputs: WhiteboardIntentOutput[] = []
  const issues: MutationCompileIssue<'invalid' | 'cancelled'>[] = []
  let workingDoc = input.document

  for (const intent of input.intents) {
    const pendingOps: Operation[] = []
    const pendingIssues: MutationCompileIssue<'invalid' | 'cancelled'>[] = []
    let blocked = false
    let shouldStop = false

    const ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'> = {
      doc: () => workingDoc,
      emit: (op) => {
        pendingOps.push(op)
      },
      emitMany: (...nextOps) => {
        pendingOps.push(...nextOps)
      },
      issue: (issue) => {
        const normalized = normalizeIssue(issue)
        pendingIssues.push(normalized)
        if (normalized.severity !== 'warning') {
          blocked = true
        }
      },
      stop: () => {
        shouldStop = true
        return {
          kind: 'stop'
        }
      },
      block: (issue) => {
        const normalized = normalizeIssue(issue)
        pendingIssues.push(normalized)
        blocked = true
        return {
          kind: 'block',
          issue: normalized
        }
      },
      require: (value, issue) => {
        if (value !== undefined) {
          return value
        }

        ctx.issue(issue)
        return undefined
      }
    }

    const compileContext = createWhiteboardIntentContext({
      ctx,
      ids: input.ids,
      registries: input.registries
    })
    const handler = whiteboardIntentHandlers[intent.type]
    const output = handler(intent as never, compileContext)

    if (
      output
      && typeof output === 'object'
      && 'kind' in output
      && (output.kind === 'stop' || output.kind === 'block')
    ) {
      if (output.kind === 'stop') {
        shouldStop = true
      } else {
        blocked = true
      }
    } else {
      outputs.push(output)
    }

    issues.push(...pendingIssues)
    if (shouldStop || blocked) {
      break
    }
    if (!pendingOps.length) {
      continue
    }

    const reduced = applyOperations({
      doc: workingDoc,
      ops: pendingOps,
      origin: 'system'
    })
    if (!reduced.ok) {
      issues.push({
        code: reduceIssueCode(reduced.error.code),
        message: reduced.error.message,
        details: reduced.error.details,
        severity: 'error'
      })
      break
    }

    ops.push(...pendingOps)
    workingDoc = reduced.doc
  }

  return {
    ops,
    outputs,
    ...(issues.length
      ? {
          issues
        }
      : {})
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
