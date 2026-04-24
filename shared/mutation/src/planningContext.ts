export type IssueSeverity =
  | 'error'
  | 'warning'

export interface ValidationIssue<TCode extends string, TSource = unknown> {
  code: TCode
  message: string
  path?: string
  severity: IssueSeverity
  details?: unknown
  source?: TSource
}

export interface IssueInput<TCode extends string> {
  code: TCode
  message: string
  path?: string
  severity?: IssueSeverity
  details?: unknown
}

export interface PlanningContext<TRead, TOp, TCode extends string, TSource = unknown> {
  readonly read: TRead
  readonly source: TSource | undefined
  emit(op: TOp): void
  emitMany(ops: readonly TOp[]): void
  issue(input: IssueInput<TCode>): void
  report(...issues: readonly ValidationIssue<TCode, TSource>[]): void
  require<T>(value: T | undefined, issue: IssueInput<TCode>): T | undefined
  hasErrors(): boolean
  clear(): void
  finish(): {
    operations: readonly TOp[]
    issues: readonly ValidationIssue<TCode, TSource>[]
  }
}

const raiseIssue = <TCode extends string, TSource>(
  issue: ValidationIssue<TCode, TSource>
): never => {
  const error = new Error(issue.message) as Error & {
    issue?: ValidationIssue<TCode, TSource>
  }
  error.issue = issue
  throw error
}

const normalizeIssue = <TCode extends string, TSource>(
  input: {
    issue: IssueInput<TCode>
    source: TSource | undefined
  }
): ValidationIssue<TCode, TSource> => ({
  ...input.issue,
  severity: input.issue.severity ?? 'error',
  ...(input.source === undefined
    ? {}
    : {
        source: input.source
      })
})

export const createPlanningContext = <
  TRead,
  TOp,
  TCode extends string,
  TSource = unknown
>(input: {
  read: TRead
  source?: TSource
  mode?: 'collect' | 'fail-fast'
  raise?: (issue: ValidationIssue<TCode, TSource>) => never
}): PlanningContext<TRead, TOp, TCode, TSource> => {
  const issues: Array<ValidationIssue<TCode, TSource>> = []
  const operations: TOp[] = []
  const mode = input.mode ?? 'collect'
  const raise = input.raise ?? raiseIssue

  const pushIssue = (
    issue: ValidationIssue<TCode, TSource>
  ) => {
    issues.push(issue)
    if (mode === 'fail-fast' && issue.severity !== 'warning') {
      raise(issue)
    }
  }

  return {
    read: input.read,
    source: input.source,
    emit: (op) => {
      operations.push(op)
    },
    emitMany: (ops) => {
      operations.push(...ops)
    },
    issue: (issue) => {
      pushIssue(normalizeIssue({
        issue,
        source: input.source
      }))
    },
    report: (...nextIssues) => {
      nextIssues.forEach((issue) => {
        pushIssue(issue)
      })
    },
    require: (value, issue) => {
      if (value !== undefined) {
        return value
      }

      pushIssue(normalizeIssue({
        issue,
        source: input.source
      }))
      return undefined
    },
    hasErrors: () => issues.some((issue) => issue.severity !== 'warning'),
    clear: () => {
      issues.length = 0
      operations.length = 0
    },
    finish: () => ({
      operations: [...operations],
      issues: [...issues]
    })
  }
}
