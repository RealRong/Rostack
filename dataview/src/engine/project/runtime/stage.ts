import type {
  CommitDelta,
  DataDoc,
  Field,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '../../index/types'
import type {
  StageAction
} from './planner'
import type {
  ProjectState
} from './state'
import type {
  Appearance,
  AppearanceId,
} from '../types'
import type {
  ProjectionSection
} from '../types'
import type {
  ResolvedViewRecordState
} from './recordState'

export interface StageRead {
  view: () => View | undefined
  fieldsById: () => ReadonlyMap<FieldId, Field>
  recordState: () => ResolvedViewRecordState
  sectionProjection: () => {
    appearances: ReadonlyMap<AppearanceId, Appearance>
    sections: readonly ProjectionSection[]
  }
}

export interface StageNext {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  index: IndexState
  read: StageRead
}

export interface StageInput<T> {
  action: StageAction
  prev?: T
  project: ProjectState
  previous: ProjectState
  next: StageNext
}

export interface Stage<T> {
  run: (input: StageInput<T>) => T | undefined
}

export const reuse = <T,>(
  input: StageInput<T>
): T | undefined => input.prev

export const shouldRun = (
  action: StageAction
) => action !== 'reuse'

export const isReconcile = (
  action: StageAction
) => action === 'reconcile'
