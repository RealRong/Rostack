import type {
  MutationCompile,
  MutationIssue,
} from '@shared/mutation'
import type {
  DataDoc,
  Intent
} from '../../types'
import {
  createDataviewQuery,
} from '../query'
import {
  dataviewMutationSchema,
} from '../schema'
import {
  type DataviewCompileContext,
  type ValidationIssue,
} from './contracts'
import { dataviewFieldIntentHandlers } from './field'
import { dataviewRecordIntentHandlers } from './record'
import { dataviewViewIntentHandlers } from './view'

export const dataviewCompileHandlers = {
  ...dataviewRecordIntentHandlers,
  ...dataviewFieldIntentHandlers,
  ...dataviewViewIntentHandlers
} as const

type SharedCompileHandler = NonNullable<
  MutationCompile<typeof dataviewMutationSchema, Intent, void>['handlers'][string]
>

type DataviewCompileHandlers = MutationCompile<
  typeof dataviewMutationSchema,
  Intent,
  void
>['handlers']

const toMutationIssue = (
  intent: Intent,
  issue: ValidationIssue & Record<string, unknown>
): MutationIssue => {
  const {
    code,
    message,
    details,
    ...rest
  } = issue

  const detailValue = {
    ...(details && typeof details === 'object'
      ? details as Record<string, unknown>
      : details === undefined
        ? {}
        : {
            value: details
          }),
    ...rest,
    source: {
      type: intent.type
    }
  }

  return {
    code,
    message,
    ...(Object.keys(detailValue).length === 0
      ? {}
      : {
          details: detailValue
        })
  }
}

const handlers = Object.fromEntries(
  Object.entries(dataviewCompileHandlers).map(([type, handler]) => {
    const compileHandler = handler as (input: DataviewCompileContext) => unknown
    return [
      type,
      ((input) => {
        const document = input.document as DataDoc
        const query = createDataviewQuery(document)
        const issue = Object.assign(
          (next: ValidationIssue & Record<string, unknown>) => {
            input.issue.add(toMutationIssue(input.intent, next))
          },
          {
            add: (next: ValidationIssue) => {
              input.issue.add(toMutationIssue(input.intent, next))
            },
            all: () => input.issue.all(),
            hasErrors: () => input.issue.hasErrors()
          }
        )

        const context: DataviewCompileContext = {
          intent: input.intent,
          document,
          read: input.read,
          write: input.write,
          query,
          change: input.change,
          issue,
          services: input.services
        }

        return compileHandler(context)
      }) satisfies SharedCompileHandler
    ]
  })
) as DataviewCompileHandlers

export const compile: MutationCompile<
  typeof dataviewMutationSchema,
  Intent,
  void
> = {
  handlers
}

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'
