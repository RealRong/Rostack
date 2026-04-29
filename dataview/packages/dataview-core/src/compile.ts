import {
  dataviewIntentHandlers
} from './operations/compile'

export const compile = {
  handlers: dataviewIntentHandlers
} as const

export {
  dataviewIntentHandlers
}

export type {
  ValidationCode,
  ValidationIssue,
  ValidationSeverity
} from './operations/contracts'
