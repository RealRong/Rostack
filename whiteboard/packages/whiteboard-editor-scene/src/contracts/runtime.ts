import type { Revision } from '@shared/projection'
import type { Capture } from './capture'
import type {
  EditorScene,
  Result,
  SceneUpdateInput,
  RuntimeStores
} from './editor'
import type { State } from './state'

export interface EditorSceneRuntime {
  readonly stores: RuntimeStores
  readonly scene: EditorScene
  revision(): Revision
  state(): State
  capture(): Capture
  update(input: SceneUpdateInput): Result
  subscribe(listener: (result: Result) => void): () => void
  dispose(): void
}
