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
  previewApply(doc: Doc, ops: readonly Op[]): Doc | CompileControl
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
          shouldStop = true
        }
      },
      stop: () => {
        shouldStop = true
        return compileControl.stop()
      },
      block: (issue) => {
        pendingIssues.push(normalizeIssue(issue))
        shouldStop = true
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
      shouldStop = true
    } else if (output !== undefined) {
      outputs.push(output)
    }

    issues.push(...pendingIssues)
    if (shouldStop) {
      break
    }
    if (!pendingOps.length) {
      continue
    }

    const preview = input.previewApply(workingDoc, pendingOps)
    if (isCompileControl(preview)) {
      if (preview.kind === 'block') {
        issues.push(normalizeIssue(preview.issue))
      }
      if (preview.kind === 'stop' || preview.kind === 'block') {
        break
      }
    }

    ops.push(...pendingOps)
    workingDoc = preview
  }

  return {
    doc: workingDoc,
    ops,
    issues,
    outputs
  }
}
