import { string } from '@shared/core'
import type {
  DataDoc,
  CustomField,
} from '@dataview/core/types/state'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  type IssueSource,
  type ValidationIssue
} from '@dataview/core/compile-contracts'

export const validateField = (
  _document: DataDoc,
  source: IssueSource,
  field: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (!string.isNonEmptyString(field.id)) {
    issues.push({
      source,
      severity: 'error',
      code: 'field.invalid',
      message: 'Field id must be a non-empty string',
      path: `${path}.id`
    })
  }
  if (!string.isNonEmptyString(field.name)) {
    issues.push({
      source,
      severity: 'error',
      code: 'field.invalid',
      message: 'Field name must be a non-empty string',
      path: `${path}.name`
    })
  }
  if (!fieldApi.schema.kind.isCustom(field.kind)) {
    issues.push({
      source,
      severity: 'error',
      code: 'field.invalid',
      message: 'Field kind is invalid',
      path: `${path}.kind`
    })
    return issues
  }

  issues.push(...fieldApi.schema.validate(field, path).map(issue => ({
    source,
    severity: 'error' as const,
    code: 'field.invalid' as const,
    message: issue.message,
    path: issue.path
  })))
  return issues
}
