import type {
  DataDoc,
} from '@dataview/core/contracts'
import {
  createProjectRuntime,
  type ProjectRuntime
} from './runtime'
import type {
  EnginePerfOptions
} from '../types'

export const createProjectSource = (options: {
  document: DataDoc
  perf?: EnginePerfOptions
}): ProjectRuntime => createProjectRuntime(options)

export type {
  ProjectRuntime
} from './runtime'
