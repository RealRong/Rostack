import {
  isNonEmptyString,
} from '@shared/core'
import type {
  DataDoc,
  CustomField,
} from '@dataview/core/contracts/state'
import {
  isCustomFieldKind,
  validateCustomFieldShape
} from '@dataview/core/field'
import { createIssue, type IssueSource, type ValidationIssue } from '#engine/mutate/issues.ts'

export const validateField = (
  _document: DataDoc,
  source: IssueSource,
  field: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (!isNonEmptyString(field.id)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field id must be a non-empty string', `${path}.id`))
  }
  if (!isNonEmptyString(field.name)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field name must be a non-empty string', `${path}.name`))
  }
  if (!isCustomFieldKind(field.kind)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field kind is invalid', `${path}.kind`))
    return issues
  }

  issues.push(...validateCustomFieldShape(field, path).map(issue => createIssue(
    source,
    'error',
    'field.invalid',
    issue.message,
    issue.path
  )))
  return issues
}
