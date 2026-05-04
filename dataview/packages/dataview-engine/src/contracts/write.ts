import type { DataDoc } from '@dataview/core/types'
import {
  dataviewMutationSchema
} from '@dataview/core/mutation'
import type {
  DataviewMutationChange
} from '@dataview/core/mutation'
import type {
  MutationCommit
} from '@shared/mutation'

type DataviewMutationCommit = MutationCommit<typeof dataviewMutationSchema>

export type EngineApplyCommit = Omit<DataviewMutationCommit, 'document' | 'change'> & {
  document: DataDoc
  change: DataviewMutationChange
}

export type EngineCommit = EngineApplyCommit

export interface EngineCommits {
  subscribe(listener: (commit: EngineCommit) => void): () => void
}
