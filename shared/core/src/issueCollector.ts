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

export interface IssueCollector<TCode extends string, TSource = unknown> {
  readonly source: TSource | undefined
  add(input: IssueInput<TCode>): void
  report(...issues: readonly ValidationIssue<TCode, TSource>[]): void
  require<T>(value: T | undefined, issue: IssueInput<TCode>): T | undefined
  hasErrors(): boolean
  clear(): void
  finish(): readonly ValidationIssue<TCode, TSource>[]
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

export const createIssueCollector = <
  TCode extends string,
  TSource = unknown
>(input: {
  source?: TSource
  mode?: 'collect' | 'fail-fast'
  raise?: (issue: ValidationIssue<TCode, TSource>) => never
} = {}): IssueCollector<TCode, TSource> => {
  const issues: Array<ValidationIssue<TCode, TSource>> = []
  const mode = input.mode ?? 'collect'
  const raise = input.raise ?? raiseIssue

  const push = (
    issue: ValidationIssue<TCode, TSource>
  ) => {
    issues.push(issue)
    if (mode === 'fail-fast' && issue.severity !== 'warning') {
      raise(issue)
    }
  }

  return {
    source: input.source,
    add: (issue) => {
      push({
        ...issue,
        severity: issue.severity ?? 'error',
        ...(input.source === undefined
          ? {}
          : {
              source: input.source
            })
      })
    },
    report: (...nextIssues) => {
      nextIssues.forEach((issue) => {
        push(issue)
      })
    },
    require: (value, issue) => {
      if (value !== undefined) {
        return value
      }

      push({
        ...issue,
        severity: issue.severity ?? 'error',
        ...(input.source === undefined
          ? {}
          : {
              source: input.source
            })
      })
      return undefined
    },
    hasErrors: () => issues.some((issue) => issue.severity !== 'warning'),
    clear: () => {
      issues.length = 0
    },
    finish: () => [...issues]
  }
}
