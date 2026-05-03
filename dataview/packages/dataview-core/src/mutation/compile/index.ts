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
  type DataviewMutationReader,
  type DataviewMutationWriter,
  type DataviewMutationDelta,
  type DataviewMutationQuery,
} from '../schema'
import {
  type DataviewCompileContext,
  type ValidationIssue,
  type ValidationSeverity
} from './contracts'
import { dataviewFieldIntentHandlers } from './field'
import { dataviewRecordIntentHandlers } from './record'
import { dataviewViewIntentHandlers } from './view'

export const dataviewCompileHandlers = {
  ...dataviewRecordIntentHandlers,
  ...dataviewFieldIntentHandlers,
  ...dataviewViewIntentHandlers
} as const

export const compile: MutationCompile<
  typeof dataviewMutationSchema,
  Intent,
  void
> = {
  handlers: Object.fromEntries(
    Object.entries(dataviewCompileHandlers).map(([type, handler]) => [
      type,
      (input: {
        intent: Intent
        document: DataDoc
        read: DataviewMutationReader
        write: DataviewMutationWriter
        query: DataviewMutationQuery
        change: DataviewMutationDelta
        issue: {
          add(issue: MutationIssue): void
          all(): readonly MutationIssue[]
          hasErrors(): boolean
        }
        services: void
      }) => {
        const compileHandler = handler as (
          input: DataviewCompileContext
        ) => unknown
        const query = createDataviewQuery(input.query)
        const issue = Object.assign(
          (next: ValidationIssue & Record<string, unknown>) => {
            input.issue.add({
              ...next,
              source: {
                type: input.intent.type
              }
            } as MutationIssue)
          },
          {
            add: (next: ValidationIssue) => {
              input.issue.add({
                ...next,
                source: {
                  type: input.intent.type
                }
              } as MutationIssue)
            },
            all: () => input.issue.all(),
            hasErrors: () => input.issue.hasErrors()
          }
        )

        const context = {
          ...input,
          query,
          issue,
        } as DataviewCompileContext

        return compileHandler(context)
      }
    ])
  ) as unknown as MutationCompile<typeof dataviewMutationSchema, Intent, void>['handlers']
}

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './contracts'
