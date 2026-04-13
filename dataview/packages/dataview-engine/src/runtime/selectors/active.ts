import type { Equality } from '@shared/core'
import type { EngineRuntimeState } from '#engine/runtime/state.ts'
import type { RuntimeStore } from '#engine/runtime/store.ts'
import { createRuntimeSelector } from '#engine/runtime/selectors/core.ts'

export const selectActiveRuntime = <T,>(input: {
  store: RuntimeStore
  read: (state: EngineRuntimeState['currentView']) => T
  isEqual?: Equality<T>
}) => createRuntimeSelector({
  store: input.store,
  read: state => input.read(state.currentView),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const selectActiveSnapshot = <T,>(input: {
  store: RuntimeStore
  read: (snapshot: EngineRuntimeState['currentView']['snapshot']) => T
  isEqual?: Equality<T>
}) => selectActiveRuntime({
  store: input.store,
  read: state => input.read(state.snapshot),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})
