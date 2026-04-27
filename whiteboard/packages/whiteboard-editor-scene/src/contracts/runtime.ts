import type { Revision } from '@shared/projection'
import type { Capture } from './capture'
import type {
  Query,
  Result,
  RuntimeStores
} from './editor'
import type { State } from './state'

export interface EditorSceneRuntime {
  readonly stores: RuntimeStores
  readonly query: Query
  revision(): Revision
  state(): State
  capture(): Capture
  subscribe(listener: (result: Result) => void): () => void
  dispose(): void
}
