import type {
  MutationCompileIssue,
  MutationCompileHandlerInput,
  MutationCompileSource
} from '@shared/mutation/engine/contracts'
import type {
  DataDoc,
  Intent
} from '@dataview/core/types'
import type {
  DataviewMutationReader,
  DataviewMutationWriter
} from '../model'
import type {
  DataviewQuery
} from '../query'
export type ValidationSeverity =
  | 'error'
  | 'warning'

export type ValidationCode =
  | 'compile.applyFailed'
  | 'batch.emptyCollection'
  | 'record.notFound'
  | 'record.duplicateId'
  | 'record.invalidId'
  | 'record.hierarchyUnsupported'
  | 'record.invalidIndex'
  | 'record.emptyPatch'
  | 'record.invalidPatch'
  | 'record.fields.invalidField'
  | 'record.fields.emptyWrite'
  | 'record.fields.overlap'
  | 'view.notFound'
  | 'view.invalid'
  | 'view.invalidProjection'
  | 'view.invalidOrder'
  | 'field.notFound'
  | 'field.invalid'
  | 'external.invalidSource'

export type IssueSource = MutationCompileSource<string>

export type ValidationIssue =
  MutationCompileIssue<ValidationCode, string>

export interface DataviewCompileExpect {
  record(id: string, path?: string): import('@dataview/core/types').DataRecord | undefined
  field(id: string, path?: string): import('@dataview/core/types').Field | undefined
  view(id: string, path?: string): import('@dataview/core/types').View | undefined
}

export type DataviewCompileContext<
  TIntent extends Intent = Intent
> = MutationCompileHandlerInput<
  DataDoc,
  TIntent,
  DataviewMutationWriter,
  DataviewMutationReader,
  void,
  string
> & {
  query: DataviewQuery
  expect?: DataviewCompileExpect
}
