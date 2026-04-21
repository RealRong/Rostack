import { string } from '@shared/core'
import type {
  DataDoc,
  CustomField,
} from '@dataview/core/contracts/state'
import {
  field as fieldApi
} from '@dataview/core/field'
import { createIssue, type IssueSource, type ValidationIssue } from '@dataview/engine/mutate/issues'

export const validateField = (
  _document: DataDoc,
  source: IssueSource,
  field: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (!string.isNonEmptyString(field.id)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field id must be a non-empty string', `${path}.id`))
  }
  if (!string.isNonEmptyString(field.name)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field name must be a non-empty string', `${path}.name`))
  }
  if (!fieldApi.schema.kind.isCustom(field.kind)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field kind is invalid', `${path}.kind`))
    return issues
  }

  issues.push(...fieldApi.schema.validate(field, path).map(issue => createIssue(
    source,
    'error',
    'field.invalid',
    issue.message,
    issue.path
  )))
  return issues
}
