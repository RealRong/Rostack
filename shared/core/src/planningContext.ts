import {
  createIssueCollector,
  type IssueCollector,
  type IssueInput,
  type ValidationIssue
} from './issueCollector'
import {
  createOperationBuffer,
  type OperationBuffer
} from './operationBuffer'

export interface PlanningContext<TRead, TOp, TCode extends string, TSource = unknown> {
  readonly read: TRead
  readonly source: TSource | undefined
  readonly issues: IssueCollector<TCode, TSource>
  readonly operations: OperationBuffer<TOp>
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
  const issues = createIssueCollector<TCode, TSource>({
    source: input.source,
    mode: input.mode,
    raise: input.raise
  })
  const operations = createOperationBuffer<TOp>()

  return {
    read: input.read,
    source: input.source,
    issues,
    operations,
    emit: (op) => {
      operations.emit(op)
    },
    emitMany: (ops) => {
      operations.emitMany(ops)
    },
    issue: (issue) => {
      issues.add(issue)
    },
    report: (...nextIssues) => {
      issues.report(...nextIssues)
    },
    require: (value, issue) => issues.require(value, issue),
    hasErrors: () => issues.hasErrors(),
    clear: () => {
      issues.clear()
      operations.clear()
    },
    finish: () => ({
      operations: operations.finish(),
      issues: issues.finish()
    })
  }
}
