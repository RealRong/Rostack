import { createPhaseGraph } from '@shared/projection-runtime'
import { publishRuntimeResult } from '@shared/projection-runtime/runtime/publish'
import { createRuntimeState } from '@shared/projection-runtime/runtime/state'
import { runRuntimeUpdate } from '@shared/projection-runtime/runtime/update'
import type {
  Change,
  Input,
  Runtime,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { createEditorGraphRuntimeSpec } from './createSpec'
import type { EditorPhaseName } from './phaseNames'
import { createEditorGraphQuery } from './query'

export const createEditorGraphRuntime = (): Runtime => {
  const spec = createEditorGraphRuntimeSpec()
  const graph = createPhaseGraph<
    EditorPhaseName,
    typeof spec.phases[number]
  >(spec.phases)
  const state = createRuntimeState<
    WorkingState,
    Snapshot,
    Change,
    EditorPhaseName,
    {
      count: number
    }
  >(
    spec.createWorking(),
    spec.createSnapshot()
  )
  const snapshot = (): Snapshot => state.snapshot
  const query = createEditorGraphQuery({
    snapshot,
    spatial: () => state.working.spatial,
    graph: () => state.working.graph,
    indexes: () => state.working.indexes
  })

  return {
    query,
    snapshot,
    update: (input: Input) => {
      const result = runRuntimeUpdate({
        spec,
        graph,
        state,
        nextInput: input
      })

      publishRuntimeResult(state, result)
      return result
    },
    subscribe: (listener) => {
      const wrapped = (result: {
        snapshot: Snapshot
        change: Change
      }) => {
        listener(result.snapshot, result.change)
      }
      state.listeners.add(wrapped)
      return () => {
        state.listeners.delete(wrapped)
      }
    }
  }
}
