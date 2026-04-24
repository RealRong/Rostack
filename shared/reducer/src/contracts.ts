export interface ReducerIssueInput<Code extends string = string> {
  code: Code
  message: string
  path?: string
  details?: unknown
  level?: 'error' | 'warning'
}

export interface ReducerIssue<Code extends string = string>
  extends Omit<ReducerIssueInput<Code>, 'level'> {
  level: 'error' | 'warning'
}

export interface ReducerDraft<Doc> {
  readonly base: Doc
  doc(): Doc
  write(): Doc
  done(): Doc
}

export interface ReducerDraftAdapter<Doc extends object> {
  create(doc: Doc): ReducerDraft<Doc>
}

export interface ReducerContext<
  Doc extends object,
  Op,
  Key,
  Code extends string = string
> {
  readonly base: Doc
  readonly origin: string

  doc(): Doc
  write(): Doc
  replace(doc: Doc): void

  inverse(op: Op): void
  inverseMany(ops: readonly Op[]): void

  footprint(key: Key): void
  footprintMany(keys: Iterable<Key>): void

  issue(issue: ReducerIssueInput<Code>): void
  require<T>(value: T | undefined, issue: ReducerIssueInput<Code>): T | undefined

  stop(): never
  fail(issue: ReducerIssueInput<Code>): never
}

export type ReducerHandler<Ctx, Op> = (
  ctx: Ctx,
  op: Op
) => void

export type ReducerHandlerMap<
  Ctx,
  Op extends { type: string }
> = {
  [Type in Op['type']]?: ReducerHandler<
    Ctx,
    Extract<Op, { type: Type }>
  >
}

export interface ReducerSpec<
  Doc extends object,
  Op extends { type: string },
  Key,
  Extra = void,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  Code extends string = string
> {
  clone?(doc: Doc): Doc
  draft?: ReducerDraftAdapter<Doc>
  serializeKey(key: Key): string

  validate?(input: {
    doc: Doc
    ops: readonly Op[]
    origin: string
  }): ReducerIssueInput<Code> | undefined

  createContext?(ctx: ReducerContext<Doc, Op, Key, Code>): DomainCtx

  beforeEach?(ctx: DomainCtx, op: Op): void

  handlers: ReducerHandlerMap<DomainCtx, Op>

  settle?(ctx: DomainCtx): void

  done?(ctx: DomainCtx): Extra

  emptyExtra?(): Extra
}

export type ReducerResult<
  Doc,
  Op,
  Key,
  Extra = void,
  Code extends string = string
> =
  | {
      ok: true
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      extra: Extra
      issues: readonly ReducerIssue<Code>[]
    }
  | {
      ok: false
      doc: Doc
      forward: readonly Op[]
      inverse: readonly Op[]
      footprint: readonly Key[]
      issues: readonly ReducerIssue<Code>[]
      error: ReducerIssue<Code>
    }
