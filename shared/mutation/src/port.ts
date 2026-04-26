import type { HistoryPort } from './localHistory'
import type {
  CommitRecord,
  CommitStream,
  Origin,
  Write
} from './write'

export interface MutationPort<
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  W extends Write<Doc, Op, Key, any> = Write<Doc, Op, Key, any>
> {
  readonly commits: CommitStream<CommitRecord<Doc, Op, Key, any>>
  readonly history: HistoryPort<Result, Op, Key, W>
  readonly internal: {
    history: {
      observeRemote(
        changeId: string,
        footprint: readonly Key[]
      ): void
      confirmPublished(input: {
        id: string
        footprint: readonly Key[]
      }): void
      cancelPending(mode: 'restore' | 'invalidate'): void
    }
  }
  doc(): Doc
  replace(
    doc: Doc,
    options?: {
      origin?: Origin
    }
  ): boolean
  apply(
    ops: readonly Op[],
    options?: {
      origin?: Origin
    }
  ): Result
}
