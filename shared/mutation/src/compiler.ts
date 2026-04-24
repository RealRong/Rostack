export interface Issue {
  code: string
  message: string
  path?: string
  level?: 'error' | 'warning'
}

export interface CompileCtx<Doc, Op> {
  doc(): Doc
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  issue(issue: Issue): void
  require<T>(
    value: T | undefined,
    code: string,
    message: string,
    path?: string
  ): T | undefined
}

export type CompileOne<Doc, Intent, Op, Output = void> = (
  ctx: CompileCtx<Doc, Op>,
  intent: Intent,
  index: number
) => Output | void

export interface CompileResult<Doc, Op, Output = void> {
  doc: Doc
  ops: readonly Op[]
  issues: readonly Issue[]
  outputs: readonly Output[]
}

const COMPILE_STOP = Symbol('compile-stop')

type CompileStopError = {
  [COMPILE_STOP]: true
}

const createCompileStopError = (): CompileStopError => ({
  [COMPILE_STOP]: true
})

const isCompileStopError = (
  value: unknown
): value is CompileStopError => (
  typeof value === 'object'
  && value !== null
  && COMPILE_STOP in value
)

const normalizeIssue = (
  issue: Issue
): Required<Pick<Issue, 'code' | 'message' | 'level'>> & Omit<Issue, 'level'> => ({
  ...issue,
  level: issue.level ?? 'error'
})

export const compile = <
  Doc,
  Intent,
  Op,
  Output = void
>(input: {
  doc: Doc
  intents: readonly Intent[]
  run: CompileOne<Doc, Intent, Op, Output>
  previewApply(doc: Doc, ops: readonly Op[]): Doc
  stopOnError?: boolean
}): CompileResult<Doc, Op, Output> => {
  const ops: Op[] = []
  const issues: Issue[] = []
  const outputs: Output[] = []
  const stopOnError = input.stopOnError ?? false
  let workingDoc = input.doc

  for (const [index, intent] of input.intents.entries()) {
    const pendingOps: Op[] = []
    const pendingIssues: Issue[] = []

    const ctx: CompileCtx<Doc, Op> = {
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
        if (stopOnError && normalized.level !== 'warning') {
          throw createCompileStopError()
        }
      },
      require: (value, code, message, path) => {
        if (value !== undefined) {
          return value
        }

        ctx.issue({
          code,
          message,
          path,
          level: 'error'
        })

        return undefined
      }
    }

    try {
      const output = input.run(ctx, intent, index)
      issues.push(...pendingIssues)
      if (output !== undefined) {
        outputs.push(output)
      }
      if (!pendingOps.length) {
        continue
      }

      ops.push(...pendingOps)
      workingDoc = input.previewApply(workingDoc, pendingOps)
    } catch (error) {
      issues.push(...pendingIssues)
      if (isCompileStopError(error)) {
        break
      }
      throw error
    }
  }

  return {
    doc: workingDoc,
    ops,
    issues,
    outputs
  }
}
