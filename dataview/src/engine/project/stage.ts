import type {
  CommitDelta,
  DataDoc,
  Field,
  FieldId,
  RecordId,
  Row,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ResolvedViewRecordState
} from '@dataview/core/view'
import type {
  IndexState
} from '../index/types'
import type {
  StageAction
} from './planner'
import type {
  ProjectState
} from './state'
import type {
  Appearance,
  AppearanceId,
} from './types'
import type {
  ProjectionSection
} from './types'

export interface StageRead {
  view: () => View | undefined
  fieldsById: () => ReadonlyMap<FieldId, Field>
  recordState: () => ResolvedViewRecordState
  sectionProjection: () => {
    appearances: ReadonlyMap<AppearanceId, Appearance>
    sections: readonly ProjectionSection[]
  }
  rowsById: () => ReadonlyMap<RecordId, Row>
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
