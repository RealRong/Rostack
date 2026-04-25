export interface Issue {
  code: string
  message: string
  path?: string
  level?: 'error' | 'warning'
  details?: unknown
}

export type CompileControl =
  | {
      kind: 'stop'
    }
  | {
      kind: 'block'
      issue: Issue
    }

export interface CompileCtx<Doc, Op> {
  doc(): Doc
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  issue(issue: Issue): void
  stop(): CompileControl
  block(issue: Issue): CompileControl
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
) => Output | CompileControl | void

export type CompileApplyResult<Doc> =
  | {
      ok: true
      doc: Doc
    }
  | {
      ok: false
      issue: Issue
    }

export interface CompileResult<Doc, Op, Output = void> {
  doc: Doc
  ops: readonly Op[]
  issues: readonly Issue[]
  outputs: readonly Output[]
}

const normalizeIssue = (
  issue: Issue
): Required<Pick<Issue, 'code' | 'message' | 'level'>> & Omit<Issue, 'level'> => ({
  ...issue,
  level: issue.level ?? 'error'
})

const isCompileControl = (
  value: unknown
): value is CompileControl => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (
    (value as { kind?: string }).kind === 'stop'
    || (value as { kind?: string }).kind === 'block'
  )
)

export const compileControl = {
  stop: (): CompileControl => ({
    kind: 'stop'
  }),
  block: (issue: Issue): CompileControl => ({
    kind: 'block',
    issue
  })
} as const

export const compile = <
  Doc,
  Intent,
  Op,
  Output = void
>(input: {
  doc: Doc
  intents: readonly Intent[]
  run: CompileOne<Doc, Intent, Op, Output>
  apply(doc: Doc, ops: readonly Op[]): CompileApplyResult<Doc>
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
    let shouldStop = false
    let blocked = false

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
          blocked = true
        }
      },
      stop: () => {
        shouldStop = true
        return compileControl.stop()
      },
      block: (issue) => {
        pendingIssues.push(normalizeIssue(issue))
        blocked = true
        return compileControl.block(issue)
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

    const output = input.run(ctx, intent, index)
    if (isCompileControl(output)) {
      if (output.kind === 'stop') {
        shouldStop = true
      } else {
        blocked = true
      }
    } else if (output !== undefined) {
      outputs.push(output)
    }

    issues.push(...pendingIssues)
    if (shouldStop) {
      break
    }
    if (blocked) {
      if (stopOnError) {
        break
      }
      continue
    }
    if (!pendingOps.length) {
      continue
    }

    const applied = input.apply(workingDoc, pendingOps)
    if (!applied.ok) {
      issues.push(normalizeIssue(applied.issue))
      break
    }

    ops.push(...pendingOps)
    workingDoc = applied.doc
  }

  return {
    doc: workingDoc,
    ops,
    issues,
    outputs
  }
}
