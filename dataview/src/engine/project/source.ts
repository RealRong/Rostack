import type {
  DataDoc,
} from '@dataview/core/contracts'
import {
  createProjectRuntime,
  type ProjectRuntime
} from './runtime'

export const createProjectSource = (options: {
  document: DataDoc
}): ProjectRuntime => createProjectRuntime(options)

export type {
  ProjectRuntime
} from './runtime'
