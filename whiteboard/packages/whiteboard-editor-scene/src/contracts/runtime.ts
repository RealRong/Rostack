import type { Revision } from '@shared/projection'
import type { Capture } from './capture'
import type {
  EditorSceneRead,
  Result,
  RuntimeStores
} from './editor'
import type { State } from './state'

export interface EditorSceneRuntime {
  readonly stores: RuntimeStores
  readonly read: EditorSceneRead
  revision(): Revision
  state(): State
  capture(): Capture
  subscribe(listener: (result: Result) => void): () => void
  dispose(): void
}
