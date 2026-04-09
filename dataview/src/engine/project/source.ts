import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import type {
  ReadStore
} from '@shared/store'
import type {
  EngineProjectApi
} from '../types'
import {
  createProjectRuntime
} from './runtime'

export const createProjectSource = (options: {
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
}): EngineProjectApi => createProjectRuntime(options)
