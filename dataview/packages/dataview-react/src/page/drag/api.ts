import { store } from '@shared/core'
import type {
  DragApi,
  DragSpec
} from '@dataview/react/page/drag/types'

export const createDragApi = (): DragApi => {
  const stateStore = store.value<DragSpec | null>(null)

  return {
    store: stateStore,
    get: stateStore.get,
    clear: () => {
      stateStore.set(null)
    },
    set: next => {
      stateStore.set(next)
    }
  }
}
