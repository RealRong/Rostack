import { definitions } from '@dataview/core/operations/definitions'
import { spec } from '@dataview/core/operations/spec'
import { apply } from '@dataview/core/operations/apply'
import { compile } from '@dataview/core/operations/compile'
import * as key from '@dataview/core/operations/key'
import * as issue from '@dataview/core/operations/issue'
import { dataviewTrace } from '@dataview/core/operations/trace'
import { recordCreate } from '@dataview/core/operations/plan'

export const operations = {
  definitions,
  spec,
  apply,
  compile,
  key,
  issue,
  trace: dataviewTrace,
  plan: {
    recordCreate
  }
} as const

export { definitions, spec, apply, compile, key, issue, dataviewTrace, recordCreate }
export type * from '@dataview/core/operations/apply'
export type * from '@dataview/core/operations/compile'
export type * from '@dataview/core/operations/definitions'
export type { DataviewMutationKey } from '@dataview/core/operations/key'
export type {
  IssueSource,
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from '@dataview/core/operations/issue'
export type { DataviewTrace } from '@dataview/core/operations/trace'
export type {
  BuildRecordCreateIntentsInput,
  RecordCreateFilterRule
} from '@dataview/core/operations/plan'
