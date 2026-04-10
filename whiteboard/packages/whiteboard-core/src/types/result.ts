export type ResultCode = 'cancelled' | 'invalid' | 'conflict' | 'unknown'

export type ErrorInfo<C extends string = string> = {
  code: C
  message: string
  details?: unknown
}

export type Result<T = void, C extends string = string> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: ErrorInfo<C>
    }
