export type ResultCode = 'cancelled' | 'invalid' | 'conflict' | 'internal'

export type InternalReason =
  | 'reconcile_cycle'
  | 'reconcile_budget_exceeded'

export type ErrorInfo<C extends string = string> = {
  code: C
  message: string
  reason?: InternalReason
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
