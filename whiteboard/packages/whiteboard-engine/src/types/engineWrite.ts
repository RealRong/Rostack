import type {
  MutationOrigin,
  MutationWrite,
} from '@shared/mutation'
import type {
  Document,
} from '@whiteboard/core/types'
import type {
  WhiteboardMutationDelta,
} from '../mutation'

type EngineCommitBase = {
  rev: number
  origin: MutationOrigin
  document: Document
  inverse: readonly MutationWrite[]
  delta: WhiteboardMutationDelta
}

export type EngineApplyCommit = EngineCommitBase & {
  kind: 'apply'
  writes: readonly MutationWrite[]
}

export type EngineReplaceCommit = EngineCommitBase & {
  kind: 'replace'
  writes: readonly MutationWrite[]
  previousDocument: Document
}

export type EngineCommit =
  | EngineApplyCommit
  | EngineReplaceCommit
