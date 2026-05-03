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
  authored: readonly MutationWrite[]
}

export type EngineReplaceCommit = EngineCommitBase & {
  kind: 'replace'
  authored: readonly MutationWrite[]
  previousDocument: Document
}

export type EngineCommit =
  | EngineApplyCommit
  | EngineReplaceCommit
