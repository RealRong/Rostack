export interface ReducerError<Code extends string = string> {
  code: Code
  message: string
  details?: unknown
}

export interface ReducerContext<
  Doc extends object,
  Op,
  Key,
  Code extends string = string
> {
  readonly origin: string

  doc(): Doc
  replace(doc: Doc): void

  inverseMany(ops: readonly Op[]): void
  footprint(key: Key): void

  fail(error: ReducerError<Code>): never
}

export interface ReducerSpec<
  Doc extends object,
  Op,
  Key,
  Extra,
  DomainCtx = ReducerContext<Doc, Op, Key, string>,
  Code extends string = string
> {
  serializeKey(key: Key): string

  createContext?(ctx: ReducerContext<Doc, Op, Key, Code>): DomainCtx

  beforeEach?(ctx: DomainCtx, op: Op): void

  handle(ctx: DomainCtx, op: Op): void

  settle?(ctx: DomainCtx): void

  done(ctx: DomainCtx): Extra
}

export type ReducerSuccess<Doc, Op, Key, Extra> = {
  ok: true
  doc: Doc
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

export type ReducerFailure<Code extends string = string> = {
  ok: false
  error: ReducerError<Code>
}

export type ReducerResult<
  Doc,
  Op,
  Key,
  Extra,
  Code extends string = string
> =
  | ReducerSuccess<Doc, Op, Key, Extra>
  | ReducerFailure<Code>
